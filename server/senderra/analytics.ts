import type { Container } from "@azure/cosmos";
import type { ExtractItem, OcrItem } from "./types.js";

/**
 * Analytics & Cost, computed from the two stage records.
 *
 * Everything here is a sum or a mean over fields the pipeline already measures
 * per document — no modelled rates, no extrapolation. Where a number is a
 * projection rather than an observation (the annualised figures) it is labelled
 * as one in the UI and derived from the observed per-document cost, so it moves
 * when the real cost moves.
 */

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const mean = (values: number[]) => (values.length > 0 ? sum(values) / values.length : null);

function nums<T>(rows: T[], pick: (row: T) => unknown): number[] {
  return rows
    .map(pick)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

/** Confidence bands chosen to match the routing thresholds, not round numbers. */
const CONFIDENCE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "< 0.60", min: 0, max: 0.6 },
  { label: "0.60–0.75", min: 0.6, max: 0.75 },
  { label: "0.75–0.90", min: 0.75, max: 0.9 },
  { label: "0.90–0.95", min: 0.9, max: 0.95 },
  { label: "≥ 0.95", min: 0.95, max: Infinity },
];

export async function computeAnalytics(container: Container) {
  const { resources } = await container.items
    .query<OcrItem | ExtractItem>({
      query: "SELECT * FROM c WHERE c.itemType = 'ocr' OR c.itemType = 'extract'",
    })
    .fetchAll();

  const extracts = resources.filter((r) => r.itemType === "extract") as ExtractItem[];
  const ocrs = resources.filter((r) => r.itemType === "ocr") as OcrItem[];
  const succeeded = extracts.filter((r) => r.status === "Succeeded");

  const cuUsd = sum(nums(ocrs, (r) => r.cost_cu_usd));
  const llmUsd = sum(nums(extracts, (r) => r.cost_llm_usd));
  const llmUncachedUsd = sum(nums(extracts, (r) => (r as { cost_llm_uncached_usd?: number }).cost_llm_uncached_usd));
  const cacheSavingUsd = sum(nums(extracts, (r) => (r as { cache_saving_usd?: number }).cache_saving_usd));
  const spendUsd = sum(nums(extracts, (r) => r.total_cost_usd));
  const pagesBilled = sum(nums(ocrs, (r) => (r as { pages_billed?: number }).pages_billed));
  const documents = extracts.length;

  /**
   * Latency, composed so the parts add up to the whole.
   *
   * WARNING: `e2e_latency_ms` is PER STAGE, not per pipeline. On the `ocr`
   * record it covers stage 1 (CU plus overhead); on the `extract` record it
   * covers stage 2 (both model calls plus overhead). Summing stage-1 components
   * against the stage-2 total - the obvious reading of the field name -
   * produces a chart whose segments exceed 100%.
   *
   * So the breakdown below is the three values that genuinely compose: queue
   * wait, stage 1, stage 2. The hop between them (Event Grid delivery on the
   * markdown write, plus the extract-queue wait) is NOT instrumented - `extract`
   * carries no `queue_wait_ms` - so the composed total is a FLOOR on real
   * wall-clock, not the exact figure. The UI says so rather than implying a
   * precision the pipeline does not record.
   */
  const perDoc = extracts.map((row) => {
    const ocr = ocrs.find((o) => o.documentId === row.documentId);
    const queue = typeof ocr?.queue_wait_ms === "number" ? ocr.queue_wait_ms : 0;
    const stage1 = typeof ocr?.e2e_latency_ms === "number" ? ocr.e2e_latency_ms : 0;
    const stage2 = typeof row.e2e_latency_ms === "number" ? row.e2e_latency_ms : 0;
    return { queue, stage1, stage2, total: queue + stage1 + stage2 };
  });

  const queueWaitMs = mean(perDoc.map((d) => d.queue));
  const stage1Ms = mean(perDoc.map((d) => d.stage1));
  const stage2Ms = mean(perDoc.map((d) => d.stage2));
  const classifyMs = mean(nums(extracts, (r) => r.classify_ms));
  const extractMs = mean(nums(extracts, (r) => r.extract_ms));
  const cuMs = mean(nums(ocrs, (r) => (r as { cu_latency_ms?: number }).cu_latency_ms));

  const byDocTypeMap = new Map<
    string,
    { count: number; spend: number[]; scores: number[]; pages: number[]; needsReview: number }
  >();
  for (const row of extracts) {
    const key = row.doc_type_predicted ?? "unclassified";
    const entry =
      byDocTypeMap.get(key) ?? { count: 0, spend: [], scores: [], pages: [], needsReview: 0 };
    entry.count += 1;
    if (typeof row.total_cost_usd === "number") entry.spend.push(row.total_cost_usd);
    if (typeof row.field_score_mean === "number") entry.scores.push(row.field_score_mean);
    if (typeof row.page_count === "number") entry.pages.push(row.page_count);
    if (row.needs_review) entry.needsReview += 1;
    byDocTypeMap.set(key, entry);
  }

  const tally = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  };

  const scores = nums(extracts, (r) => r.field_score_mean);

  // Spend per calendar day, oldest first. Sparse by nature — these are demo and
  // benchmark runs, not a production stream — so the UI plots the days present
  // rather than filling an empty axis.
  const byDay = new Map<string, { spend: number; documents: number }>();
  for (const row of extracts) {
    const stamp = row.recorded_at;
    if (!stamp) continue;
    const day = stamp.slice(0, 10);
    const entry = byDay.get(day) ?? { spend: 0, documents: 0 };
    entry.spend += typeof row.total_cost_usd === "number" ? row.total_cost_usd : 0;
    entry.documents += 1;
    byDay.set(day, entry);
  }

  const costPerDoc = documents > 0 ? spendUsd / documents : null;

  return {
    totals: {
      documents,
      succeeded: succeeded.length,
      pagesBilled,
      spendUsd,
      cuUsd,
      llmUsd,
      llmUncachedUsd,
      cacheSavingUsd,
      costPerDoc,
      costPerPage: pagesBilled > 0 ? spendUsd / pagesBilled : null,
      costPer1kPages: pagesBilled > 0 ? (spendUsd / pagesBilled) * 1000 : null,
    },
    tokens: {
      prompt: sum(nums(extracts, (r) => r.prompt_tokens)),
      cached: sum(nums(extracts, (r) => r.cached_tokens)),
      completion: sum(nums(extracts, (r) => r.completion_tokens)),
      reasoning: sum(nums(extracts, (r) => (r as { reasoning_tokens?: number }).reasoning_tokens)),
      cacheHitFrac: mean(nums(extracts, (r) => r.cache_hit_frac)),
    },
    latency: {
      queueWaitMs,
      stage1Ms,
      stage2Ms,
      cuMs,
      classifyMs,
      extractMs,
      pipelineMeanMs: mean(perDoc.map((d) => d.total)),
      pipelineMaxMs: Math.max(0, ...perDoc.map((d) => d.total)),
      // True while the pipeline does not time the extract-queue hop, which is
      // every document today. Kept as a flag so the caveat disappears by itself
      // if that instrumentation is ever added.
      composedFloor: extracts.every(
        (r) => typeof (r as { queue_wait_ms?: number }).queue_wait_ms !== "number"
      ),
    },
    quality: {
      stpRate: succeeded.length > 0 ? succeeded.filter((r) => r.needs_review === false).length / succeeded.length : null,
      stpCount: succeeded.filter((r) => r.needs_review === false).length,
      avgFieldScore: mean(scores),
      avgGroundedFrac: mean(nums(extracts, (r) => r.grounded_frac)),
      quoteNotFound: sum(nums(extracts, (r) => r.quote_not_found)),
      fieldsNeedingReview: sum(nums(extracts, (r) => r.fields_needing_review)),
      fieldsTotal: sum(nums(extracts, (r) => r.field_count)),
      avgOcrConf: mean(nums(extracts, (r) => r.ocr_conf_mean)),
      minPageConfidence: Math.min(
        1,
        ...nums(ocrs, (r) => (r as { min_page_confidence?: number }).min_page_confidence)
      ),
    },
    gates: {
      documentReasons: tally(extracts.flatMap((r) => r.review_reasons ?? [])),
      fieldReasons: tally(
        extracts.flatMap((r) => (r as { field_review_reasons?: string[] }).field_review_reasons ?? [])
      ),
    },
    byDocType: [...byDocTypeMap.entries()]
      .map(([docType, entry]) => ({
        docType,
        count: entry.count,
        spendUsd: sum(entry.spend),
        avgCostUsd: mean(entry.spend),
        avgFieldScore: mean(entry.scores),
        pages: sum(entry.pages),
        needsReview: entry.needsReview,
      }))
      .sort((a, b) => b.spendUsd - a.spendUsd),
    confidenceHistogram: CONFIDENCE_BUCKETS.map((bucket) => ({
      label: bucket.label,
      count: scores.filter((value) => value >= bucket.min && value < bucket.max).length,
    })),
    costTrend: [...byDay.entries()]
      .map(([day, entry]) => ({ day, ...entry }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    /**
     * The three settings the pipeline docs call out as silently expensive.
     * Surfacing the measured value is the only way anyone notices one has
     * drifted — none of them produce an error when they go wrong.
     */
    guards: {
      contextualizationUsd: sum(
        nums(ocrs, (r) => (r as { cost_cu_contextualization_usd?: number }).cost_cu_contextualization_usd)
      ),
      contextualizationTokens: sum(
        nums(ocrs, (r) => (r as { contextualization_tokens?: number }).contextualization_tokens)
      ),
      pagesBasic: sum(nums(ocrs, (r) => (r as { pages_basic?: number }).pages_basic)),
      pagesStandard: sum(nums(ocrs, (r) => (r as { pages_standard?: number }).pages_standard)),
      throttleCount: sum(nums(extracts, (r) => (r as { throttle_count?: number }).throttle_count)),
      analyzers: [...new Set(ocrs.map((r) => r.analyzer_id).filter(Boolean))],
      models: [...new Set(extracts.map((r) => r.model_deployment).filter(Boolean))],
    },
  };
}

export type SenderraAnalytics = Awaited<ReturnType<typeof computeAnalytics>>;
