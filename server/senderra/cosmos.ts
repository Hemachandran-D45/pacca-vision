import { CosmosClient, type Container } from "@azure/cosmos";
import { isConfigError, readConfig, type SenderraConfig } from "./config";
import type {
  DocumentSummary,
  ExtractItem,
  FieldsItem,
  OcrItem,
  ReviewAudit,
  ReviewItem,
} from "./types";

/**
 * One client per process, held for the lifetime of the lambda instance. A new
 * CosmosClient per request re-runs the TLS handshake and the account metadata
 * fetch, which on a cold Vercel function is most of the latency budget.
 */
let cached: { container: Container; config: SenderraConfig } | null = null;

export function container(): { container: Container; config: SenderraConfig } | { error: string; missing: string[] } {
  const config = readConfig();
  if (isConfigError(config)) return { error: config.error, missing: config.missing };

  if (cached && cached.config.cosmosEndpoint === config.cosmosEndpoint) return cached;

  const client = new CosmosClient({ endpoint: config.cosmosEndpoint, key: config.cosmosKey });
  cached = {
    container: client.database(config.cosmosDatabase).container(config.cosmosContainer),
    config,
  };
  return cached;
}

export function documentKey(runId: string, docId: string): string {
  return `${runId}/${docId}`;
}

/** `<runId>/<docId>` back into its parts. docId may itself contain slashes. */
export function splitDocumentId(documentId: string): { runId: string; docId: string } {
  const cut = documentId.indexOf("/");
  if (cut < 0) return { runId: "prod", docId: documentId };
  return { runId: documentId.slice(0, cut), docId: documentId.slice(cut + 1) };
}

/**
 * Every ocr / extract / review record, projected to the columns the list view
 * needs.
 *
 * Cross-partition, and deliberately so — one logical partition per document is
 * what makes "open this document" a 1 RU point read, and the cost of that
 * choice is paid here. The projection keeps it cheap: `fields` items (~10 KB
 * each) are excluded by the WHERE clause and the container's indexing policy
 * excludes `/fields/*` outright, so the scan never touches them.
 *
 * ⚠️ The aggregation below is done in JS, not in SQL. Cosmos rejects
 * `GROUP BY` with aggregates on a cross-partition query — the server returns
 * "Cross partition query only supports 'VALUE <AggregateFunc>' for aggregates".
 * At the current corpus this is a ~2 MB scan. Per guide/12 §12, the trigger to
 * replace it with a rollup item is a dashboard load costing >5,000 RU.
 */
async function fetchRecords(c: Container) {
  const { resources } = await c.items
    .query<OcrItem | ExtractItem | ReviewItem>({
      query:
        "SELECT * FROM c WHERE c.itemType = 'ocr' OR c.itemType = 'extract' OR c.itemType = 'review'",
    })
    .fetchAll();

  const ocr = new Map<string, OcrItem>();
  const extract = new Map<string, ExtractItem>();
  const review = new Map<string, ReviewItem>();
  for (const item of resources) {
    if (item.itemType === "ocr") ocr.set(item.documentId, item as OcrItem);
    else if (item.itemType === "extract") extract.set(item.documentId, item as ExtractItem);
    else if (item.itemType === "review") review.set(item.documentId, item as ReviewItem);
  }
  return { ocr, extract, review };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The one place a pipeline status becomes something a reviewer sees.
 *
 * An approved review outranks `needs_review`, because `needs_review` is the
 * pipeline's routing decision at extract time and does not change when a human
 * resolves the document. Reading it as live state would leave every reviewed
 * document sitting in the queue forever.
 */
export function deriveUiStatus(
  ocr: OcrItem | undefined,
  extract: ExtractItem | undefined,
  review: ReviewItem | undefined
): DocumentSummary["uiStatus"] {
  if (review?.status === "approved") return "Processed";
  if (review?.status === "rejected") return "Failed";
  if (!extract) {
    if (!ocr) return "Queued";
    return ocr.status === "Succeeded" ? "Processing" : "Failed";
  }
  if (extract.status === "ClassifiedOther") return "Triage";
  if (extract.status && extract.status !== "Succeeded") return "Failed";
  if (extract.needs_review) return review?.claimed_by ? "In HIL Review" : "Needs Review";
  return "Processed";
}

function toSummary(
  documentId: string,
  ocr: OcrItem | undefined,
  extract: ExtractItem | undefined,
  review: ReviewItem | undefined
): DocumentSummary {
  const { runId, docId } = splitDocumentId(documentId);
  const corrections = review?.corrections ?? {};
  return {
    documentId,
    runId,
    docId,
    file: docId.endsWith(".pdf") ? docId : `${docId}.pdf`,
    docType: extract?.doc_type_predicted ?? null,
    pipelineStatus: extract?.status ?? ocr?.status ?? "Queued",
    uiStatus: deriveUiStatus(ocr, extract, review),
    confidence: numberOrNull(extract?.field_score_mean),
    classifyConfidence: numberOrNull(extract?.classify_confidence),
    pages: numberOrNull(extract?.page_count ?? ocr?.page_count),
    fileBytes: numberOrNull(ocr?.file_bytes),
    needsReview: Boolean(extract?.needs_review),
    reviewReasons: extract?.review_reasons ?? [],
    reviewFields: extract?.review_fields ?? [],
    fieldCount: numberOrNull(extract?.field_count),
    fieldsNeedingReview: numberOrNull(extract?.fields_needing_review),
    costUsd: numberOrNull(extract?.total_cost_usd ?? ocr?.cost_cu_usd),
    latencyMs: numberOrNull(extract?.e2e_latency_ms ?? ocr?.e2e_latency_ms),
    minPageConfidence: numberOrNull(ocr?.min_page_confidence),
    receivedAt: extract?.recorded_at ?? ocr?.recorded_at ?? null,
    source: extract?.source ?? ocr?.source ?? null,
    reviewStatus: review?.status ?? null,
    reviewedBy: review?.reviewed_by ?? null,
    claimedBy: review?.claimed_by ?? null,
    correctionCount: Object.keys(corrections).length,
  };
}

export async function listDocuments(c: Container): Promise<DocumentSummary[]> {
  const { ocr, extract, review } = await fetchRecords(c);
  const ids = new Set([...ocr.keys(), ...extract.keys(), ...review.keys()]);
  return [...ids]
    .map((id) => toSummary(id, ocr.get(id), extract.get(id), review.get(id)))
    .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
}

/**
 * All items for one document, in a single-partition query. This is the reviewer
 * UI's primary read and the reason the partition key is per-document: the ocr
 * record, the extract record, the field detail and the review state come back
 * together for a handful of RU.
 */
export async function readDocument(c: Container, documentId: string) {
  const { resources } = await c.items
    .query<OcrItem | ExtractItem | FieldsItem | ReviewItem>(
      {
        query: "SELECT * FROM c WHERE c.documentId = @k",
        parameters: [{ name: "@k", value: documentId }],
      },
      { partitionKey: documentId }
    )
    .fetchAll();

  const ocr = resources.find((r) => r.itemType === "ocr") as OcrItem | undefined;
  const extract = resources.find((r) => r.itemType === "extract") as ExtractItem | undefined;
  const fields = resources.find((r) => r.itemType === "fields") as FieldsItem | undefined;
  const review = resources.find((r) => r.itemType === "review") as ReviewItem | undefined;

  if (!ocr && !extract && !fields && !review) return null;

  return {
    summary: toSummary(documentId, ocr, extract, review),
    ocr: ocr ?? null,
    extract: extract ?? null,
    fields: fields ?? null,
    review: review ?? null,
  };
}

/**
 * Read-modify-write of the review item.
 *
 * Not a patch: the audit array is append-only and has to be read before it can
 * be appended to. This is last-writer-wins across concurrent reviewers, which
 * is correct for a demo and is the thing to replace with an ETag precondition
 * if two people ever review the same document at once.
 */
export async function applyReviewAction(
  c: Container,
  documentId: string,
  action: {
    type: "claim" | "release" | "correct" | "approve" | "reject";
    by: string;
    note?: string | null;
    corrections?: Record<string, unknown>;
  }
): Promise<ReviewItem> {
  const { runId, docId } = splitDocumentId(documentId);
  const now = new Date().toISOString();

  let existing: ReviewItem | undefined;
  try {
    const { resource } = await c.item("review", documentId).read<ReviewItem>();
    existing = resource;
  } catch {
    existing = undefined;
  }

  const item: ReviewItem = {
    id: "review",
    itemType: "review",
    documentId,
    runId,
    docId,
    status: existing?.status ?? "pending",
    corrections: { ...(existing?.corrections ?? {}) },
    audit: [...(existing?.audit ?? [])],
    claimed_by: existing?.claimed_by ?? null,
    claimed_at: existing?.claimed_at ?? null,
    reviewed_by: existing?.reviewed_by ?? null,
    reviewed_at: existing?.reviewed_at ?? null,
    note: existing?.note ?? null,
    updatedAt: now,
  };
  const audit = item.audit as ReviewAudit[];

  if (action.type === "claim") {
    item.claimed_by = action.by;
    item.claimed_at = now;
    item.status = "claimed";
    audit.push({ at: now, by: action.by, action: "claimed" });
  }

  if (action.type === "release") {
    item.claimed_by = null;
    item.claimed_at = null;
    item.status = "pending";
    audit.push({ at: now, by: action.by, action: "released" });
  }

  if (action.corrections) {
    for (const [field, value] of Object.entries(action.corrections)) {
      const previous = item.corrections?.[field]?.value ?? null;
      // A no-op edit is dropped rather than recorded. `field_corrections where
      // original == corrected` is the false-positive signal for the routing
      // gates, and padding it with unchanged values destroys that measurement.
      if (previous === value) continue;
      item.corrections![field] = { value, by: action.by, at: now };
      audit.push({
        at: now,
        by: action.by,
        action: "corrected",
        field,
        old_value: previous,
        new_value: value,
      });
    }
  }

  if (action.type === "approve" || action.type === "reject") {
    item.status = action.type === "approve" ? "approved" : "rejected";
    item.reviewed_by = action.by;
    item.reviewed_at = now;
    item.note = action.note ?? null;
    audit.push({
      at: now,
      by: action.by,
      action: action.type === "approve" ? "approved" : "rejected",
      note: action.note ?? null,
    });
  }

  await c.items.upsert(item);
  return item;
}
