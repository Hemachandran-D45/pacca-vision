import { isConfigError, readConfig } from "./config.js";
import { container } from "./cosmos.js";
import { listRecentUploads } from "./blob.js";
import type { OcrItem, ExtractItem } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GapSeverity = "critical" | "warning" | "info";

export type PipelineGapEvent = {
  gapId: string;
  severity: GapSeverity;
  category:
    | "event_grid_gap"
    | "ocr_stuck"
    | "extract_missing"
    | "dlq_overflow"
    | "long_running"
    | "duplicate_orphan";
  documentId: string;
  runId: string;
  docId: string;
  blobPath: string | null;
  uploadedAt: string | null;
  stuckForMs: number | null;
  ocrStatus: string | null;
  extractStatus: string | null;
  lastCosmosTs: string | null;
  investigateKql: string;
  rootCauseHypothesis: string;
  remediation: string;
};

export type PipelineGapSummary = {
  ok: boolean;
  checkedAt: string;
  blobCount: number;
  cosmosCount: number;
  gaps: PipelineGapEvent[];
  eventGridGaps: number;
  ocrStuck: number;
  extractMissing: number;
  longRunning: number;
  estimatedDlqDepth: number;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function gapId(documentId: string, category: string) {
  return `gap_${category}_${documentId.replace(/[^a-z0-9]/gi, "_").slice(0, 32)}`;
}

function stuckMs(uploadedAt: string | null, lastCosmosTs: string | null): number | null {
  const base = lastCosmosTs ?? uploadedAt;
  if (!base) return null;
  return Date.now() - new Date(base).getTime();
}

// ─── Core detector ────────────────────────────────────────────────────────────

export async function detectPipelineGaps(
  runIdFilter?: string
): Promise<PipelineGapSummary> {
  const checkedAt = new Date().toISOString();

  const config = readConfig();
  if (isConfigError(config)) {
    return {
      ok: false,
      checkedAt,
      blobCount: 0,
      cosmosCount: 0,
      gaps: [],
      eventGridGaps: 0,
      ocrStuck: 0,
      extractMissing: 0,
      longRunning: 0,
      estimatedDlqDepth: 0,
    };
  }

  // 1. List blobs
  let blobs: Awaited<ReturnType<typeof listRecentUploads>> = [];
  try {
    blobs = await listRecentUploads(config, runIdFilter);
  } catch {
    // storage unavailable
  }

  // 2. Pull Cosmos records
  type CosmosEntry = (OcrItem | ExtractItem) & { recorded_at?: string };
  const cosmosItems: CosmosEntry[] = [];
  const ocrByDocId = new Map<string, OcrItem & { recorded_at?: string }>();
  const extractByDocId = new Map<string, ExtractItem & { recorded_at?: string }>();

  try {
    const handle = await container();
    if (!("error" in handle)) {
      const { resources } = await handle.container.items
        .query<CosmosEntry>({
          query:
            "SELECT * FROM c WHERE (c.itemType = 'ocr' OR c.itemType = 'extract') ORDER BY c._ts DESC",
        })
        .fetchAll();

      for (const item of resources) {
        cosmosItems.push(item);
        const anyItem = item as Record<string, unknown>;
        const docId = String(item.docId || anyItem.doc_id || item.documentId || "");
        if (item.itemType === "ocr") {
          if (!ocrByDocId.has(docId)) ocrByDocId.set(docId, item as OcrItem & { recorded_at?: string });
        } else if (item.itemType === "extract") {
          if (!extractByDocId.has(docId)) extractByDocId.set(docId, item as ExtractItem & { recorded_at?: string });
        }
      }
    }
  } catch {
    // cosmos unavailable
  }

  const gaps: PipelineGapEvent[] = [];

  // 3. Reconcile blobs vs Cosmos
  for (const blob of blobs) {
    const cut = blob.documentId.indexOf("/");
    const docId = cut < 0 ? blob.documentId : blob.documentId.slice(cut + 1);
    const runId = cut < 0 ? "prod" : blob.documentId.slice(0, cut);

    if (runIdFilter && runId !== runIdFilter) continue;

    const ocrRecord = ocrByDocId.get(docId) ?? ocrByDocId.get(blob.documentId);
    const extractRecord = extractByDocId.get(docId) ?? extractByDocId.get(blob.documentId);

    const uploadedAt = blob.uploadedAt;
    const uploadAgeMs = uploadedAt ? Date.now() - new Date(uploadedAt).getTime() : null;

    // Skip very recent uploads — still in-flight
    const MIN_FLAG_AGE_MS = 60_000;
    if (uploadAgeMs !== null && uploadAgeMs < MIN_FLAG_AGE_MS) continue;

    if (!ocrRecord) {
      const stuckForMs = uploadAgeMs;
      const isLongStuck = stuckForMs !== null && stuckForMs > 5 * 60_000;
      gaps.push({
        gapId: gapId(blob.documentId, "event_grid_gap"),
        severity: isLongStuck ? "critical" : "warning",
        category: "event_grid_gap",
        documentId: blob.documentId,
        runId,
        docId,
        blobPath: blob.blobPath,
        uploadedAt,
        stuckForMs,
        ocrStatus: null,
        extractStatus: null,
        lastCosmosTs: null,
        investigateKql: `traces | where doc_id contains "${docId}" | order by timestamp desc | take 10`,
        rootCauseHypothesis:
          "Blob was written to docs-in but no OCR record exists in Cosmos DB. " +
          "Event Grid subscription either never fired or the Service Bus delivery failed silently. " +
          "Top causes: (1) Event Grid subscription misconfiguration, (2) missing 'Azure Service Bus Data Sender' RBAC, " +
          "(3) Function App cold-start during high-traffic burst.",
        remediation:
          "1. az eventgrid event-subscription list --source-resource-id <storage-account-id>\n" +
          "2. Verify RBAC: Service Bus namespace → Access Control → Role assignments → fn_ocr managed identity\n" +
          "3. Inspect fn_ocr Application Insights invocations log for the upload timestamp window\n" +
          "4. Check Event Grid → Topics → Metrics → Delivery Failed count",
      });
      continue;
    }

    const ocrStatus = String(ocrRecord.status || "Unknown");
    const lastCosmosTs = String(ocrRecord.recorded_at || "");

    if (ocrStatus === "Failed" || ocrStatus === "SubmitFailed" || ocrStatus === "PollTimeout") {
      gaps.push({
        gapId: gapId(blob.documentId, "ocr_stuck"),
        severity: "critical",
        category: "ocr_stuck",
        documentId: blob.documentId,
        runId,
        docId,
        blobPath: blob.blobPath,
        uploadedAt,
        stuckForMs: stuckMs(uploadedAt, lastCosmosTs),
        ocrStatus,
        extractStatus: null,
        lastCosmosTs,
        investigateKql: `traces | where doc_id contains "${docId}" and stage == "ocr" | order by timestamp desc | take 5`,
        rootCauseHypothesis:
          `fn_ocr submitted the document to Azure Content Understanding but received terminal status "${ocrStatus}". ` +
          "This is an unrecoverable error — document is now stuck at Stage 1 with no extract record.",
        remediation:
          "1. Check Content Understanding resource quota and throttling in Azure Monitor\n" +
          "2. Search fn_ocr Application Insights for HTTP 429 / 5xx from CU endpoint\n" +
          "3. Validate AZURE_CONTENT_UNDERSTANDING_ENDPOINT in Function App config\n" +
          "4. Manually re-trigger by re-uploading the document",
      });
      continue;
    }

    if (ocrStatus === "InProgress" || ocrStatus === "Running") {
      const stuck = stuckMs(uploadedAt, lastCosmosTs);
      const P95_OCR_MS = 120_000;
      if (stuck !== null && stuck > P95_OCR_MS) {
        gaps.push({
          gapId: gapId(blob.documentId, "long_running"),
          severity: "warning",
          category: "long_running",
          documentId: blob.documentId,
          runId,
          docId,
          blobPath: blob.blobPath,
          uploadedAt,
          stuckForMs: stuck,
          ocrStatus,
          extractStatus: null,
          lastCosmosTs,
          investigateKql: `traces | where doc_id contains "${docId}" | order by timestamp desc | take 10`,
          rootCauseHypothesis:
            `fn_ocr has been "${ocrStatus}" for ${Math.round((stuck ?? 0) / 1000)}s, exceeding P95 baseline of 120s. ` +
            "Document may be too large or Content Understanding is under capacity pressure.",
          remediation:
            "1. Check Content Understanding processing queue depth in Azure Monitor Metrics\n" +
            "2. Verify fn_ocr host.json: maxAutoLockRenewalDuration must be ≥ 00:30:00\n" +
            "3. Consider splitting large PDFs (>100 pages) before upload",
        });
      }
      continue;
    }

    // OCR succeeded — check for extract
    if (!extractRecord && ocrStatus === "Succeeded") {
      gaps.push({
        gapId: gapId(blob.documentId, "extract_missing"),
        severity: "warning",
        category: "extract_missing",
        documentId: blob.documentId,
        runId,
        docId,
        blobPath: blob.blobPath,
        uploadedAt,
        stuckForMs: stuckMs(uploadedAt, lastCosmosTs),
        ocrStatus,
        extractStatus: null,
        lastCosmosTs,
        investigateKql: `traces | where doc_id contains "${docId}" | order by timestamp desc | take 10`,
        rootCauseHypothesis:
          "Stage 1 (fn_ocr) completed and wrote the markdown checkpoint. " +
          "Stage 2 (fn_extract) has not yet produced an extract record. " +
          "Possible causes: (1) Service Bus extract-queue message not delivered, " +
          "(2) fn_extract cold start or crash loop, (3) Azure OpenAI quota throttle.",
        remediation:
          "1. Check fn_extract Application Insights for startup or invocation errors\n" +
          "2. Verify Service Bus extract-queue → Active Message Count in Azure Portal\n" +
          "3. Confirm AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_KEY in fn_extract settings\n" +
          "4. Check if Azure OpenAI quota is exhausted: Portal → OpenAI → Quotas",
      });
    }
  }

  // 4. Estimate DLQ depth from Cosmos error patterns
  const estimatedDlqDepth = cosmosItems.filter((item) => {
    const anyItem = item as Record<string, unknown>;
    return (
      item.status === "Failed" ||
      item.status === "PollTimeout" ||
      Boolean(anyItem.error_message)
    );
  }).length;

  return {
    ok: true,
    checkedAt,
    blobCount: blobs.length,
    cosmosCount: cosmosItems.length,
    gaps,
    eventGridGaps: gaps.filter((g) => g.category === "event_grid_gap").length,
    ocrStuck: gaps.filter((g) => g.category === "ocr_stuck").length,
    extractMissing: gaps.filter((g) => g.category === "extract_missing").length,
    longRunning: gaps.filter((g) => g.category === "long_running").length,
    estimatedDlqDepth,
  };
}
