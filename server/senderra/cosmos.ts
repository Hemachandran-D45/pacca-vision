import type { Container } from "@azure/cosmos";
import { isConfigError, readConfig, type SenderraConfig } from "./config.js";
import type {
  DocumentSummary,
  ExtractedField,
  FieldProvenance,
  ExtractItem,
  FieldsItem,
  GapsItem,
  OcrItem,
  ReviewAudit,
  ReviewItem,
} from "./types.js";

/**
 * One client per process, held for the lifetime of the lambda instance. A new
 * CosmosClient per request re-runs the TLS handshake and the account metadata
 * fetch, which on a cold Vercel function is most of the latency budget.
 */
let cached: { container: Container; config: SenderraConfig } | null = null;

/**
 * The SDK is loaded lazily, on purpose.
 *
 * A top-level `import { CosmosClient } from "@azure/cosmose"` runs at module
 * scope, which on a serverless host is BEFORE any request handler and therefore
 * before any try/catch of ours. If that import throws — wrong Node version, a
 * dependency the platform failed to trace — the whole function dies and the
 * platform returns an opaque 500 with no body to debug. Importing inside the
 * function puts the failure inside our own error handling, so it comes back as
 * readable JSON instead.
 */
export async function container(): Promise<
  { container: Container; config: SenderraConfig } | { error: string; missing: string[] }
> {
  const config = readConfig();
  if (isConfigError(config)) return { error: config.error, missing: config.missing };

  if (cached && cached.config.cosmosEndpoint === config.cosmosEndpoint) return cached;

  let CosmosClient: typeof import("@azure/cosmos").CosmosClient;
  try {
    ({ CosmosClient } = await import("@azure/cosmos"));
  } catch (error) {
    return {
      error: `Failed to load @azure/cosmos (node ${process.version}): ${String(error)}`,
      missing: [],
    };
  }

  const client = new CosmosClient({ endpoint: config.cosmosEndpoint, key: config.cosmosKey });
  cached = {
    container: client.database(config.cosmosDatabase).container(config.cosmosContainer),
    config,
  };
  return cached;
}

/**
 * The identity `syncIvrOutreach` and the writeback webhook sign their writes
 * with. A correction carrying it is a phone answer, not a human edit — the
 * only thing separating the two in the review item.
 */
export const IVR_IDENTITY = "IVR Outreach";

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
export async function fetchRecords(c: Container) {
  const { resources } = await c.items
    .query<OcrItem | ExtractItem | ReviewItem | GapsItem>({
      query:
        "SELECT * FROM c WHERE c.itemType = 'ocr' OR c.itemType = 'extract' OR c.itemType = 'review' OR c.itemType = 'gaps'",
    })
    .fetchAll();

  const ocr = new Map<string, OcrItem>();
  const extract = new Map<string, ExtractItem>();
  const review = new Map<string, ReviewItem>();
  const gaps = new Map<string, GapsItem>();
  for (const item of resources) {
    if (item.itemType === "ocr") ocr.set(item.documentId, item as OcrItem);
    else if (item.itemType === "extract") extract.set(item.documentId, item as ExtractItem);
    else if (item.itemType === "review") review.set(item.documentId, item as ReviewItem);
    else if (item.itemType === "gaps") gaps.set(item.documentId, item as GapsItem);
  }
  return { ocr, extract, review, gaps };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The one place a pipeline status becomes something a reviewer sees.
 *
 * An approved review or resolved gaps item outranks `needs_review`, because `needs_review` is the
 * pipeline's routing decision at extract time and does not change when a human or IVR
 * resolves the document. Reading it as live state would leave every reviewed
 * document sitting in the queue forever.
 */
export function deriveUiStatus(
  ocr: OcrItem | undefined,
  extract: ExtractItem | undefined,
  review: ReviewItem | undefined,
  gaps?: GapsItem | undefined
): DocumentSummary["uiStatus"] {
  if (review?.status === "approved") return "Processed";
  if (review?.status === "rejected") return "Failed";

  const isGapsResolved =
    gaps?.gapStatus === "resolved" ||
    (gaps && typeof gaps.openCount === "number" && gaps.openCount === 0 && gaps.gapStatus !== "open");

  if (review?.status === "routed_to_ivr") {
    if (isGapsResolved) return "Processed";
    return "Routed to IVR";
  }

  if (isGapsResolved && extract?.status === "Succeeded") {
    return "Processed";
  }

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
  review: ReviewItem | undefined,
  gaps?: GapsItem | undefined
): DocumentSummary {
  const { runId, docId } = splitDocumentId(documentId);
  const corrections = review?.corrections ?? {};
  const isGapsResolved =
    gaps?.gapStatus === "resolved" ||
    (gaps && typeof gaps.openCount === "number" && gaps.openCount === 0 && gaps.gapStatus !== "open");
  const isApproved = review?.status === "approved";
  const isRejected = review?.status === "rejected";

  return {
    documentId,
    runId,
    docId,
    file: docId.endsWith(".pdf") ? docId : `${docId}.pdf`,
    docType: extract?.doc_type_predicted ?? null,
    pipelineStatus: extract?.status ?? ocr?.status ?? "Queued",
    uiStatus: deriveUiStatus(ocr, extract, review, gaps),
    confidence: numberOrNull(extract?.field_score_mean),
    classifyConfidence: numberOrNull(extract?.classify_confidence),
    pages: numberOrNull(extract?.page_count ?? ocr?.page_count),
    fileBytes: numberOrNull(ocr?.file_bytes),
    needsReview:
      isApproved || isRejected || isGapsResolved
        ? false
        : Boolean(extract?.needs_review),
    reviewReasons: extract?.review_reasons ?? [],
    reviewFields: extract?.review_fields ?? [],
    fieldCount: numberOrNull(extract?.field_count),
    fieldsNeedingReview: isApproved || isGapsResolved ? 0 : numberOrNull(extract?.fields_needing_review),
    costUsd: numberOrNull(extract?.total_cost_usd ?? ocr?.cost_cu_usd),
    latencyMs: numberOrNull(extract?.e2e_latency_ms ?? ocr?.e2e_latency_ms),
    minPageConfidence: numberOrNull(ocr?.min_page_confidence),
    receivedAt: extract?.recorded_at ?? ocr?.recorded_at ?? null,
    source: extract?.source ?? ocr?.source ?? null,
    reviewStatus: isGapsResolved && review?.status === "routed_to_ivr" ? "approved" : review?.status ?? null,
    reviewedBy: review?.reviewed_by ?? (isGapsResolved ? IVR_IDENTITY : null),
    claimedBy: review?.claimed_by ?? null,
    correctionCount: Object.keys(corrections).length,
  };
}

export type FetchedRecords = Awaited<ReturnType<typeof fetchRecords>>;

/**
 * Pass `records` when the caller has already fetched them. `/stats` needs both
 * the joined summaries and the raw extract rows, and fetching twice doubled the
 * RU and the wall-clock on the single slowest thing either endpoint does.
 */
export async function listDocuments(
  c: Container,
  records?: FetchedRecords
): Promise<DocumentSummary[]> {
  const { ocr, extract, review, gaps } = records ?? (await fetchRecords(c));
  const ids = new Set([...ocr.keys(), ...extract.keys(), ...review.keys(), ...gaps.keys()]);
  return [...ids]
    .map((id) => toSummary(id, ocr.get(id), extract.get(id), review.get(id), gaps.get(id)))
    .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
}

/**
 * The question the IVR call was scripted to ask, per field.
 *
 * `will_ask` is the IVR backend's own echo of the script, stored on the gaps
 * item when the trigger is accepted. It is the only place the caller-facing
 * wording ("member ID on your insurance card") exists — the gap's own
 * `description` is the extraction prompt, written for the model, not a person.
 */
function askedAsByField(gaps: GapsItem | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(gaps?.will_ask)) return out;
  for (const entry of gaps.will_ask) {
    if (entry && typeof entry.field === "string" && typeof entry.asked_as === "string") {
      out[entry.field] = entry.asked_as;
    }
  }
  return out;
}

/** Provenance for a value that came off an IVR call, from the gap that carried it. */
function ivrProvenance(
  gap: Record<string, unknown> | undefined,
  askedAs: string | undefined,
  requestId: string | number | null,
  fallbackAt?: string | null
): FieldProvenance {
  const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value : null;
  return {
    origin: "ivr",
    by: text(gap?.source),
    at: text(gap?.captured_at) ?? fallbackAt ?? null,
    askedAs: askedAs ?? null,
    callId: text(gap?.call_id),
    requestId,
  };
}

/**
 * All items for one document, in a single-partition query. This is the reviewer
 * UI's primary read and the reason the partition key is per-document: the ocr
 * record, the extract record, the field detail and the review state come back
 * together for a handful of RU.
 */
export async function readDocument(c: Container, documentId: string) {
  const { resources } = await c.items
    .query<OcrItem | ExtractItem | FieldsItem | ReviewItem | GapsItem>(
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
  const gaps = resources.find((r) => r.itemType === "gaps") as GapsItem | undefined;

  if (!ocr && !extract && !fields && !review && !gaps) return null;

  let mergedFields = fields ?? null;
  const nextFields: Record<string, ExtractedField> = { ...(fields?.fields ?? {}) };
  let hasFieldUpdates = false;

  const askedAs = askedAsByField(gaps);
  const requestId = gaps?.request_id ?? null;

  // Merge values collected by IVR stored in gaps item
  if (gaps?.gaps) {
    for (const [name, gap] of Object.entries(gaps.gaps)) {
      const g = gap as Record<string, unknown>;
      const gapVal = g.value as string | number | boolean | null | undefined;
      const statusLower = String(g.status || "").toLowerCase();
      const isCollected =
        statusLower === "collected" ||
        statusLower === "settled" ||
        (gapVal !== undefined && gapVal !== null && String(gapVal).trim() !== "" && statusLower !== "open");
      if (isCollected && gapVal !== undefined && gapVal !== null) {
        hasFieldUpdates = true;
        const provenance = ivrProvenance(g, askedAs[name], requestId);
        if (nextFields[name]) {
          nextFields[name] = {
            ...nextFields[name],
            value: gapVal,
            needs_review: false,
            provenance,
          };
        } else {
          nextFields[name] = {
            value: gapVal,
            class: "A",
            needs_review: false,
            provenance,
          };
        }
      }
    }
  }

  // Merge reviewer corrections
  if (review?.corrections) {
    for (const [name, corr] of Object.entries(review.corrections)) {
      const val = corr.value as string | number | boolean | null;
      if (val !== undefined && val !== null) {
        hasFieldUpdates = true;
        // `syncIvrOutreach` writes collected answers as corrections under the
        // `IVR Outreach` identity, so a correction is not automatically a
        // human edit — the writer decides which badge the field gets.
        const provenance: FieldProvenance =
          corr.by === IVR_IDENTITY
            ? ivrProvenance(gaps?.gaps?.[name], askedAs[name], requestId, corr.at)
            : { origin: "reviewer", by: corr.by, at: corr.at };
        if (nextFields[name]) {
          nextFields[name] = {
            ...nextFields[name],
            value: val,
            needs_review: false,
            provenance,
          };
        } else {
          nextFields[name] = {
            value: val,
            class: "A",
            needs_review: false,
            provenance,
          };
        }
      }
    }
  }

  if (hasFieldUpdates || fields) {
    mergedFields = {
      id: "fields",
      itemType: "fields",
      documentId,
      runId: fields?.runId ?? splitDocumentId(documentId).runId,
      docId: fields?.docId ?? splitDocumentId(documentId).docId,
      ...fields,
      fields: nextFields,
    };
  }

  return {
    summary: toSummary(documentId, ocr, extract, review, gaps),
    ocr: ocr ?? null,
    extract: extract ?? null,
    fields: mergedFields,
    review: review ?? null,
    gaps: gaps ?? null,
  };
}

/** Point-read the gaps work item. Returns the stored document as-is, or null. */
export async function readGapsItem(c: Container, documentId: string): Promise<GapsItem | null> {
  try {
    const { resource } = await c.item("gaps", documentId).read<GapsItem>();
    return resource ?? null;
  } catch {
    return null;
  }
}

/**
 * Patch the gaps item the same way IDP `cosmos.patch_gaps` does. Never throws.
 * A lost annotation is not a lost document.
 */
export async function patchGaps(
  c: Container,
  documentId: string,
  operations: { op: "set"; path: string; value: unknown }[],
  etag?: string
): Promise<boolean> {
  if (operations.length === 0) return false;
  try {
    const options = etag ? { accessCondition: { type: "IfMatch" as const, condition: etag } } : undefined;
    await c.item("gaps", documentId).patch(operations, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Nothing an IVR sync could still change.
 *
 * `syncIvrOutreach` exists to write collected answers and close the document
 * out; once a human or a completed call has already done that, re-running it
 * cannot produce a new outcome — it can only append a duplicate audit entry
 * and overwrite a reviewer's correction with a stale phone answer. Both of
 * which it did, several times, before this guard existed.
 */
export function isReviewSettled(review: ReviewItem | null | undefined): boolean {
  return review?.status === "approved" || review?.status === "rejected";
}

/**
 * review + fields + gaps + extract in ONE round trip.
 *
 * All four share the `/documentId` partition — that is the whole point of the
 * partition key. Fetching them as four point reads spends four sequential
 * round trips (~250 ms each from outside the region) on what one
 * single-partition query returns for a handful of RU.
 */
async function readWritableItems(c: Container, documentId: string) {
  // `extract` is deliberately absent: nothing below writes it any more.
  let resources: (FieldsItem | GapsItem | ReviewItem)[] = [];
  try {
    ({ resources } = await c.items
      .query<FieldsItem | GapsItem | ReviewItem>(
        {
          query:
            "SELECT * FROM c WHERE c.documentId = @k AND (c.itemType = 'review' OR c.itemType = 'fields' OR c.itemType = 'gaps')",
          parameters: [{ name: "@k", value: documentId }],
        },
        { partitionKey: documentId }
      )
      .fetchAll());
  } catch {
    resources = [];
  }
  return {
    review: resources.find((r) => r.itemType === "review") as ReviewItem | undefined,
    fields: resources.find((r) => r.itemType === "fields") as FieldsItem | undefined,
    gaps: resources.find((r) => r.itemType === "gaps") as GapsItem | undefined,
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
    type: "claim" | "release" | "correct" | "approve" | "reject" | "route_to_ivr";
    by: string;
    note?: string | null;
    corrections?: Record<string, unknown>;
  }
): Promise<ReviewItem> {
  const { runId, docId } = splitDocumentId(documentId);
  const now = new Date().toISOString();

  const { review: existing, fields: fieldsItem, gaps: gapsItem } = await readWritableItems(
    c,
    documentId
  );

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

  if (action.type === "route_to_ivr") {
    item.status = "routed_to_ivr";
    item.reviewed_by = action.by;
    item.reviewed_at = now;
    if (action.note) item.note = action.note;
    audit.push({
      at: now,
      by: action.by,
      action: "routed_to_ivr",
      note: action.note ?? null,
    });
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

  /**
   * One upsert per item that actually changed, issued together.
   *
   * These were four sequential read-then-upsert pairs; the reads are now the
   * single query above, and the writes have no ordering dependency on each
   * other — they are different documents in the same partition.
   */
  const writes: Promise<unknown>[] = [c.items.upsert(item)];

  // Corrections are mirrored onto the fields item so the stored extraction
  // permanently reflects the reviewer's / IVR's answer, not just the overlay
  // that `readDocument` computes at read time.
  if (action.corrections && Object.keys(action.corrections).length > 0 && fieldsItem?.fields) {
    for (const [field, value] of Object.entries(action.corrections)) {
      const val = value as string | number | boolean | null;
      if (fieldsItem.fields[field]) {
        fieldsItem.fields[field].value = val;
        fieldsItem.fields[field].needs_review = false;
      } else {
        fieldsItem.fields[field] = { value: val, class: "A", needs_review: false };
      }
    }
    writes.push(c.items.upsert(fieldsItem));
  }

  // Approving closes out any open gaps: there is nothing left for a call to ask.
  if (action.type === "approve" && gapsItem) {
    gapsItem.gapStatus = "resolved";
    gapsItem.openCount = 0;
    for (const g of Object.values(gapsItem.gaps ?? {})) {
      if (g && g.status === "open") g.status = "settled";
    }
    writes.push(c.items.upsert(gapsItem));
  }

  /*
   * The `extract` item is deliberately NOT touched here.
   *
   * It is the pipeline's own measurement, taken at extract time: what the
   * model produced and how the gates judged it. `computeAnalytics` and
   * `/stats` aggregate over it, so clearing `needs_review` on approval
   * rewrote history — it made every reviewed document look like it had never
   * needed review, which is precisely the number the HIL loop exists to
   * measure. It also overwrote real terminal statuses (`ClassifiedOther`)
   * with `Succeeded`.
   *
   * Nothing needs the mutation: `deriveUiStatus` already ranks an approved
   * review and a resolved gaps item above `needs_review`, and `toSummary`
   * zeroes `needsReview` / `fieldsNeedingReview` for the same cases.
   */

  const settled = await Promise.allSettled(writes);
  for (const result of settled) {
    // A failed side-write must not lose the review itself, which is index 0
    // and the only one whose failure the caller can see.
    if (result.status === "rejected") console.warn("Review side-write failed:", result.reason);
  }
  if (settled[0].status === "rejected") throw settled[0].reason;

  return item;
}
