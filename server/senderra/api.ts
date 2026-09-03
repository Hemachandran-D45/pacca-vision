import { isConfigError, readConfig } from "./config.js";
import { applyReviewAction, container, fetchRecords, listDocuments, readDocument } from "./cosmos.js";
import { listRecentUploads, mintReadSas, mintUploadSas } from "./blob.js";
import { computeAnalytics } from "./analytics.js";
import type { DocumentSummary, ExtractItem } from "./types.js";

export type ApiResult = { status: number; body: unknown };

const MAX_UPLOAD_BATCH = 50;

function fail(status: number, error: string, extra?: Record<string, unknown>): ApiResult {
  return { status, body: { ok: false, error, ...extra } };
}

async function requireContainer() {
  const handle = await container();
  if ("error" in handle) return fail(503, handle.error, { missing: handle.missing });
  return handle;
}

function isFail(value: unknown): value is ApiResult {
  return typeof value === "object" && value !== null && "status" in value && "body" in value;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Documents that exist as a blob but have no Cosmos record yet, folded into the
 * list as Queued. Without this an upload disappears for the 20-40 seconds
 * between the blob write and the first `ocr` item.
 */
async function withPendingUploads(documents: DocumentSummary[]): Promise<DocumentSummary[]> {
  const config = readConfig();
  if (isConfigError(config)) return documents;

  let pending: Awaited<ReturnType<typeof listRecentUploads>>;
  try {
    pending = await listRecentUploads(config);
  } catch {
    // A storage hiccup must not empty the Documents table — Cosmos already
    // answered, and this is only the leading edge of the list.
    return documents;
  }

  const known = new Set(documents.map((d) => d.documentId));
  const extra: DocumentSummary[] = pending
    .filter((p) => !known.has(p.documentId))
    .map((p) => {
      const cut = p.documentId.indexOf("/");
      const runId = cut < 0 ? "prod" : p.documentId.slice(0, cut);
      const docId = cut < 0 ? p.documentId : p.documentId.slice(cut + 1);
      return {
        documentId: p.documentId,
        runId,
        docId,
        file: `${docId}.pdf`,
        docType: null,
        pipelineStatus: "Queued",
        uiStatus: "Queued",
        confidence: null,
        classifyConfidence: null,
        pages: null,
        fileBytes: p.size,
        needsReview: false,
        reviewReasons: [],
        reviewFields: [],
        fieldCount: null,
        fieldsNeedingReview: null,
        costUsd: null,
        latencyMs: null,
        minPageConfidence: null,
        receivedAt: p.uploadedAt,
        source: "upload",
        reviewStatus: null,
        reviewedBy: null,
        claimedBy: null,
        correctionCount: 0,
      } satisfies DocumentSummary;
    });

  return [...extra, ...documents].sort((a, b) =>
    (b.receivedAt ?? "").localeCompare(a.receivedAt ?? "")
  );
}

async function handleDocuments(query: URLSearchParams): Promise<ApiResult> {
  const handle = await requireContainer();
  if (isFail(handle)) return handle;

  let documents = await listDocuments(handle.container);
  documents = await withPendingUploads(documents);

  const runId = query.get("runId");
  if (runId) documents = documents.filter((d) => d.runId === runId);

  const docType = query.get("docType");
  if (docType) documents = documents.filter((d) => d.docType === docType);

  if (query.get("needsReview") === "true") {
    // The HIL queue: still routed for review and not yet resolved by a human.
    documents = documents.filter(
      (d) => d.needsReview && d.reviewStatus !== "approved" && d.reviewStatus !== "rejected"
    );
  }

  const search = query.get("q")?.trim().toLowerCase();
  if (search) {
    documents = documents.filter(
      (d) =>
        d.docId.toLowerCase().includes(search) ||
        (d.docType ?? "").toLowerCase().includes(search) ||
        d.runId.toLowerCase().includes(search)
    );
  }

  const limit = Number(query.get("limit") || 0);
  if (Number.isFinite(limit) && limit > 0) documents = documents.slice(0, limit);

  return {
    status: 200,
    body: {
      ok: true,
      documents,
      runIds: [...new Set(documents.map((d) => d.runId))].sort(),
      docTypes: [...new Set(documents.map((d) => d.docType).filter(Boolean))].sort(),
    },
  };
}

async function handleDocument(query: URLSearchParams): Promise<ApiResult> {
  const documentId = query.get("documentId");
  if (!documentId) return fail(400, "documentId is required.");

  const handle = await requireContainer();
  if (isFail(handle)) return handle;

  const document = await readDocument(handle.container, documentId);
  if (!document) return fail(404, `No document ${documentId}.`);

  // The source PDF path is only recorded on the ocr item. Before stage 1
  // finishes there is none, so fall back to the convention the uploader used.
  const blobPath = document.ocr?.blob_path ?? `${handle.config.docsContainer}/${documentId}.pdf`;
  let pdfUrl: string | null = null;
  try {
    pdfUrl = await mintReadSas(handle.config, blobPath);
  } catch {
    pdfUrl = null;
  }

  return { status: 200, body: { ok: true, ...document, pdfUrl } };
}

async function handleStats(): Promise<ApiResult> {
  const handle = await requireContainer();
  if (isFail(handle)) return handle;

  // One scan, reused for both views of it. This used to issue two full
  // cross-partition queries per dashboard load.
  const records = await fetchRecords(handle.container);
  const resources = [...records.extract.values()];
  const documents = await listDocuments(handle.container, records);
  const succeeded = resources.filter((r) => r.status === "Succeeded");
  const num = (pick: (r: ExtractItem) => number | undefined) =>
    resources.map(pick).filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const pendingReview = documents.filter(
    (d) => d.needsReview && d.reviewStatus !== "approved" && d.reviewStatus !== "rejected"
  ).length;
  const reviewed = documents.filter((d) => d.reviewStatus === "approved").length;

  // Straight-through processing: succeeded, and tripped no review gate. This is
  // the number the business case rests on, so it is counted over the documents
  // the pipeline actually finished, never over the whole corpus.
  const stp = succeeded.filter((r) => r.needs_review === false).length;

  return {
    status: 200,
    body: {
      ok: true,
      stats: {
        documents: documents.length,
        processed: succeeded.length,
        pendingReview,
        reviewed,
        stpCount: stp,
        stpRate: succeeded.length > 0 ? stp / succeeded.length : null,
        avgFieldScore: mean(num((r) => r.field_score_mean)),
        avgOcrConfidence: mean(num((r) => r.ocr_conf_mean)),
        avgCacheHit: mean(num((r) => r.cache_hit_frac)),
        avgLatencyMs: mean(num((r) => r.e2e_latency_ms)),
        totalCostUsd: num((r) => r.total_cost_usd).reduce((sum, value) => sum + value, 0),
        pagesBilled: num((r) => r.pages_billed).reduce((sum, value) => sum + value, 0),
        byDocType: Object.entries(
          resources.reduce<Record<string, number>>((acc, r) => {
            const key = r.doc_type_predicted ?? "unclassified";
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {})
        )
          .map(([docType, count]) => ({ docType, count }))
          .sort((a, b) => b.count - a.count),
        byStatus: Object.entries(
          documents.reduce<Record<string, number>>((acc, d) => {
            acc[d.uiStatus] = (acc[d.uiStatus] ?? 0) + 1;
            return acc;
          }, {})
        ).map(([status, count]) => ({ status, count })),
      },
    },
  };
}

async function handleAnalytics(): Promise<ApiResult> {
  const handle = await requireContainer();
  if (isFail(handle)) return handle;
  return { status: 200, body: { ok: true, analytics: await computeAnalytics(handle.container) } };
}

async function handleUploadSas(body: Record<string, unknown>): Promise<ApiResult> {
  const config = readConfig();
  if (isConfigError(config)) return fail(503, config.error, { missing: config.missing });

  const files = body.files;
  if (!Array.isArray(files) || files.length === 0) {
    return fail(400, "Provide files: [{ name }].");
  }
  if (files.length > MAX_UPLOAD_BATCH) {
    return fail(400, `At most ${MAX_UPLOAD_BATCH} files per request.`);
  }

  const runIdRaw = typeof body.runId === "string" ? body.runId.trim() : "";
  const runId = runIdRaw || config.uploadRunId;
  // The run id becomes the first path segment and then the Cosmos partition key
  // prefix, so it has to survive both without re-encoding.
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
    return fail(400, "runId may only contain letters, digits, dot, dash and underscore.");
  }

  const grants = [];
  for (const entry of files) {
    const name = typeof entry === "string" ? entry : (entry as { name?: unknown })?.name;
    if (typeof name !== "string" || !name.trim()) {
      return fail(400, "Every file needs a name.");
    }
    grants.push(await mintUploadSas(config, runId, name.trim()));
  }

  return { status: 200, body: { ok: true, runId, container: config.docsContainer, grants } };
}

async function handleReview(body: Record<string, unknown>): Promise<ApiResult> {
  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const type = typeof body.action === "string" ? body.action : "";
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "";

  if (!documentId) return fail(400, "documentId is required.");
  if (!by) return fail(400, "A reviewer identity (by) is required.");
  if (!["claim", "release", "correct", "approve", "reject"].includes(type)) {
    return fail(400, "action must be claim, release, correct, approve or reject.");
  }

  const corrections =
    body.corrections && typeof body.corrections === "object" && !Array.isArray(body.corrections)
      ? (body.corrections as Record<string, unknown>)
      : undefined;

  if (type === "correct" && (!corrections || Object.keys(corrections).length === 0)) {
    return fail(400, "action 'correct' needs a non-empty corrections object.");
  }

  const handle = await requireContainer();
  if (isFail(handle)) return handle;

  const review = await applyReviewAction(handle.container, documentId, {
    type: type as "claim" | "release" | "correct" | "approve" | "reject",
    by,
    note: typeof body.note === "string" ? body.note : null,
    corrections,
  });

  return { status: 200, body: { ok: true, review } };
}

async function handleHealth(): Promise<ApiResult> {
  const config = readConfig();
  if (isConfigError(config)) {
    return { status: 200, body: { ok: false, configured: false, missing: config.missing } };
  }
  const handle = await requireContainer();
  if (isFail(handle)) return handle;
  try {
    const { resources } = await handle.container.items
      .query<number>({ query: "SELECT VALUE COUNT(1) FROM c" })
      .fetchAll();
    return {
      status: 200,
      body: {
        ok: true,
        configured: true,
        cosmos: `${config.cosmosDatabase}/${config.cosmosContainer}`,
        storage: `${config.storageAccount}/${config.docsContainer}`,
        uploadRunId: config.uploadRunId,
        items: resources[0] ?? 0,
      },
    };
  } catch (error) {
    return fail(502, `Cosmos read failed: ${String(error)}`);
  }
}

/**
 * One dispatcher, mounted twice: as Vite dev middleware in `vite.config.ts` and
 * as a Vercel serverless function in `api/senderra.ts`. Keeping the routing here
 * rather than in either host is what stops dev and production drifting apart.
 */
export async function handleSenderra(
  method: string,
  path: string,
  query: URLSearchParams,
  body: Record<string, unknown>
): Promise<ApiResult> {
  const route = `/${path.replace(/^\/+|\/+$/g, "")}`;

  try {
    if (method === "GET" && route === "/health") return await handleHealth();
    if (method === "GET" && route === "/documents") return await handleDocuments(query);
    if (method === "GET" && route === "/document") return await handleDocument(query);
    if (method === "GET" && route === "/stats") return await handleStats();
    if (method === "GET" && route === "/analytics") return await handleAnalytics();
    if (method === "POST" && route === "/upload-sas") return await handleUploadSas(body);
    if (method === "POST" && route === "/review") return await handleReview(body);
    return fail(404, `No Senderra route ${method} ${route}.`);
  } catch (error) {
    return fail(500, String(error));
  }
}
