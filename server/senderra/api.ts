import type { Container } from "@azure/cosmos";
import { isConfigError, readConfig } from "./config.js";
import {
  applyReviewAction,
  container,
  fetchRecords,
  isReviewSettled,
  IVR_IDENTITY,
  listDocuments,
  patchGaps,
  readDocument,
  readGapsItem,
} from "./cosmos.js";
import {
  fetchOutreach,
  gapsPayloadFromExtract,
  ivrHealthPublic,
  outreachHint,
  patchOps,
  SKIP_NO_GAPS,
  trigger,
  type GapsItem,
} from "./ivr.js";
import { listRecentUploads, mintReadSas, mintUploadSas } from "./blob.js";
import { computeAnalytics } from "./analytics.js";
import { getDynamicSchema, syncSchemasToBlob } from "./schemaLoader.js";
import type { DocumentSummary, ExtractItem, OcrItem } from "./types.js";
import { handleObservabilityChat } from "./observabilityChat.js";
import { executeKql } from "./kqlEngine.js";
import { detectPipelineGaps } from "./pipelineGaps.js";
import {
  ADMIN,
  DEVELOPER,
  STAFF,
  authorize,
  authorizeMachine,
  clearedSessionCookie,
  currentUser,
  jwtSecret,
  sessionCookie,
  signSession,
  type RequestContext,
  type Role,
} from "../auth.js";
import { login } from "./users.js";

/** `headers` lets a route set a cookie; every entry point copies them onto the response. */
export type ApiResult = { status: number; body: unknown; headers?: Record<string, string> };

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

function pendingToSummary(p: {
  documentId: string;
  size: number;
  uploadedAt: string | null;
}): DocumentSummary {
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
  };
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
    pending = await listRecentUploads(config, config.uploadRunId);
  } catch {
    // A storage hiccup must not empty the Documents table — Cosmos already
    // answered, and this is only the leading edge of the list.
    return documents;
  }

  const known = new Set(documents.map((d) => d.documentId));
  const extra = pending.filter((p) => !known.has(p.documentId)).map(pendingToSummary);

  return [...extra, ...documents].sort((a, b) =>
    (b.receivedAt ?? "").localeCompare(a.receivedAt ?? "")
  );
}

async function handleDocuments(query: URLSearchParams): Promise<ApiResult> {
  const handle = await requireContainer();
  if (isFail(handle)) return handle;

  let documents = await listDocuments(handle.container);

  /*
   * Documents with a call still in flight, checked against the IVR backend.
   *
   * Settled ones are excluded up front — re-asking about a document a human or
   * a completed call already closed cannot change the answer, and each check
   * costs an external round trip. Concurrently, not in sequence: this used to
   * be a serial loop of 10s-timeout fetches, so N routed documents made the
   * list endpoint N x 10s in the worst case and blew the serverless budget.
   */
  const ivrCandidates = documents.filter(
    (d) =>
      d.reviewStatus !== "approved" &&
      d.reviewStatus !== "rejected" &&
      (d.uiStatus === "Routed to IVR" || d.reviewStatus === "routed_to_ivr")
  );
  if (ivrCandidates.length > 0) {
    const results = await Promise.all(
      ivrCandidates.map(async (d) => {
        try {
          const gaps = (await readGapsItem(handle.container, d.documentId)) as GapsItem | null;
          const reqId = gaps?.request_id;
          if (!reqId) return false;
          return await syncIvrOutreach(handle.container, d.documentId, reqId as string | number);
        } catch {
          return false;
        }
      })
    );
    if (results.some(Boolean)) {
      documents = await listDocuments(handle.container);
    }
  }

  documents = await withPendingUploads(documents);

  const runId = query.get("runId");
  if (runId) documents = documents.filter((d) => d.runId === runId);

  const docType = query.get("docType");
  if (docType) documents = documents.filter((d) => d.docType === docType);

  if (query.get("needsReview") === "true") {
    // The HIL queue: still routed for review and not yet resolved by a human or IVR.
    documents = documents.filter(
      (d) =>
        d.needsReview &&
        d.uiStatus !== "Processed" &&
        d.reviewStatus !== "approved" &&
        d.reviewStatus !== "rejected" &&
        d.reviewStatus !== "routed_to_ivr"
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

async function syncIvrOutreach(
  container: Container,
  documentId: string,
  requestId: string | number
): Promise<boolean> {
  try {
    const outreach = await fetchOutreach(requestId);
    if (!outreach) return false;

    const statusUpper = String(outreach.status || "").toUpperCase();
    const isCompleted = statusUpper === "COMPLETED";
    const isPartial = statusUpper === "PARTIAL";

    if (!isCompleted && !isPartial) return false;

    const settledCorrections: Record<string, unknown> = {};
    for (const f of outreach.fields ?? []) {
      const val = f.value;
      const fStatus = String(f.status || "").toUpperCase();
      const isSettled =
        fStatus === "COMPLETED" ||
        fStatus === "COLLECTED" ||
        fStatus === "SETTLED" ||
        fStatus === "RESOLVED" ||
        (val !== undefined && val !== null && String(val).trim() !== "" && fStatus !== "PENDING");
      if (isSettled && val !== undefined && val !== null) {
        settledCorrections[f.field] = val;
      }
    }

    if (Object.keys(settledCorrections).length > 0 || isCompleted) {
      await applyReviewAction(container, documentId, {
        type: isCompleted ? "approve" : "correct",
        by: IVR_IDENTITY,
        corrections: settledCorrections,
        note: `Fields collected via IVR call (request #${requestId}, status: ${outreach.status})`,
      });

      // Also ensure gaps item is updated with the collected values
      try {
        const { resource: gapsItem } = await container.item("gaps", documentId).read<GapsItem>();
        if (gapsItem) {
          if (isCompleted) {
            gapsItem.gapStatus = "resolved";
            gapsItem.openCount = 0;
          }
          if (gapsItem.gaps) {
            const capturedAt = new Date().toISOString();
            for (const [field, val] of Object.entries(settledCorrections)) {
              const gap = gapsItem.gaps[field];
              if (!gap) continue;
              gap.value = val;
              gap.status = "collected";
              // Who answered is the party the gap was routed to, not always the
              // patient — the field badge in the UI quotes this back verbatim.
              gap.source = gap.source ?? gap.askable_by ?? "patient";
              gap.captured_at = gap.captured_at ?? capturedAt;
              gap.call_id = gap.call_id ?? outreach.call_context_id ?? gapsItem.call_id ?? null;
            }
          }
          await container.items.upsert(gapsItem);
        }
      } catch (err) {
        console.warn("Could not patch gaps item in syncIvrOutreach:", err);
      }

      return true;
    }
  } catch (err) {
    console.warn(`Could not sync IVR outreach for ${documentId} (req #${requestId}):`, err);
  }
  return false;
}

async function handleDocument(query: URLSearchParams): Promise<ApiResult> {
  const documentId = query.get("documentId");
  if (!documentId) return fail(400, "documentId is required.");

  const handle = await requireContainer();
  if (isFail(handle)) return handle;

  const document = await readDocument(handle.container, documentId);

  // Cosmos is empty until OCR writes the first item. A blob in docs-in is
  // still a real document — return Queued detail instead of 404 so View
  // never opens HIL against a fake or missing id.
  if (!document) {
    let pending: Awaited<ReturnType<typeof listRecentUploads>> = [];
    try {
      pending = await listRecentUploads(handle.config, documentId);
    } catch {
      pending = [];
    }
    const match = pending.find((p) => p.documentId === documentId);
    if (!match) return fail(404, `No document ${documentId}.`);

    let pdfUrl: string | null = null;
    try {
      pdfUrl = await mintReadSas(handle.config, match.blobPath);
    } catch {
      pdfUrl = null;
    }

    return {
      status: 200,
      body: {
        ok: true,
        summary: pendingToSummary(match),
        ocr: null,
        extract: null,
        fields: null,
        review: null,
        pdfUrl,
        outreach: outreachHint(null, null, null, false),
      },
    };
  }

  // The source PDF path is only recorded on the ocr item. Before stage 1
  // finishes there is none, so fall back to the convention the uploader used.
  const blobPath = document.ocr?.blob_path ?? `${handle.config.docsContainer}/${documentId}.pdf`;
  let pdfUrl: string | null = null;
  try {
    pdfUrl = await mintReadSas(handle.config, blobPath);
  } catch {
    pdfUrl = null;
  }

  let currentDoc = document;

  /*
   * Re-check the IVR backend only while a call could still change something.
   *
   * `request_id` stays on the gaps item forever, so the old condition was true
   * for the rest of the document's life: every 5s poll of this endpoint paid
   * an outreach fetch plus a full re-settlement (~2.8s of a 3.0s response) to
   * redo work that finished hours earlier — which is also what appended a
   * dozen duplicate `approved` audit entries per document and let a stale
   * phone answer overwrite a reviewer's correction. Settled is final; a later
   * revision on the IVR side has to arrive through `/ivr-writeback`.
   */
  const settled = isReviewSettled(currentDoc.review);
  if (
    !settled &&
    (currentDoc.summary.uiStatus === "Routed to IVR" ||
      currentDoc.review?.status === "routed_to_ivr" ||
      currentDoc.gaps?.gapStatus === "in_progress" ||
      Boolean(currentDoc.gaps?.request_id))
  ) {
    const reqId =
      currentDoc.gaps?.request_id ??
      (typeof currentDoc.review?.note === "string"
        ? currentDoc.review.note.match(/request[:\s#]+(\w+)/i)?.[1]
        : null);

    if (reqId) {
      const synced = await syncIvrOutreach(handle.container, documentId, String(reqId));
      if (synced) {
        const reloaded = await readDocument(handle.container, documentId);
        if (reloaded) currentDoc = reloaded;
      }
    }
  }

  const docType = currentDoc.extract?.doc_type_predicted ?? currentDoc.fields?.docType ?? currentDoc.gaps?.docType ?? null;
  return {
    status: 200,
    body: {
      ok: true,
      ...currentDoc,
      pdfUrl,
      outreach: outreachHint(docType, currentDoc.fields?.fields ?? null, currentDoc.gaps, Boolean(currentDoc.extract)),
    },
  };
}

async function handleIvrTrigger(body: Record<string, unknown>): Promise<ApiResult> {
  const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
  if (!documentId) return fail(400, "documentId is required.");

  const handle = await requireContainer();
  if (isFail(handle)) return handle;

  const stored = (await readGapsItem(handle.container, documentId)) as GapsItem | null;
  let payload: GapsItem | null = stored;
  if (!payload) {
    const document = await readDocument(handle.container, documentId);
    payload = gapsPayloadFromExtract(documentId, document?.extract ?? null, document?.fields ?? null);
  }
  if (!payload) {
    return {
      status: 200,
      body: {
        ok: true,
        trigger_status: SKIP_NO_GAPS,
        skipReason: SKIP_NO_GAPS,
        patched: false,
      },
    };
  }

  const outcome = await trigger(payload);
  const ops = patchOps(outcome);
  const patched = stored ? await patchGaps(handle.container, documentId, ops, stored._etag) : false;

  const isCompleted = String(outcome.call_status || "").toUpperCase() === "COMPLETED";

  if (outcome.trigger_status === "accepted") {
    if (outcome.request_id) {
      await syncIvrOutreach(handle.container, documentId, outcome.request_id as string | number);
    }

    if (!isCompleted) {
      try {
        await applyReviewAction(handle.container, documentId, {
          type: "route_to_ivr",
          by: typeof body.by === "string" && body.by.trim() ? body.by.trim() : IVR_IDENTITY,
          note: `Routed to IVR (call_status: ${outcome.call_status ?? "calling"}${outcome.request_id ? `, request: ${outcome.request_id}` : ""})`,
        });
      } catch (err) {
        console.warn("Could not record review action for IVR trigger:", err);
      }
    }
  }

  const skipReason =
    outcome.trigger_status === "accepted" ||
    outcome.trigger_status === "rejected" ||
    outcome.trigger_status === "failed"
      ? null
      : outcome.trigger_status;

  return {
    status: 200,
    body: {
      ok: true,
      ...outcome,
      skipReason,
      patched,
      uiStatus: isCompleted ? "Processed" : "Routed to IVR",
    },
  };
}

async function handleIvrOutreach(query: URLSearchParams): Promise<ApiResult> {
  const reqIdParam = query.get("requestId")?.trim();
  const docIdParam = query.get("documentId")?.trim();

  let reqId = reqIdParam;
  if (!reqId && docIdParam) {
    const handle = await requireContainer();
    if (!isFail(handle)) {
      const gaps = (await readGapsItem(handle.container, docIdParam)) as GapsItem | null;
      if (gaps && gaps.request_id) {
        reqId = String(gaps.request_id);
      }
    }
  }

  if (!reqId) {
    return fail(400, "Provide requestId or documentId.");
  }

  const outreach = await fetchOutreach(reqId);
  if (!outreach) {
    return fail(404, `Could not retrieve outreach for request ${reqId}.`);
  }

  return { status: 200, body: { ok: true, outreach } };
}

async function handleStats(): Promise<ApiResult> {
  const handle = await requireContainer();
  if (isFail(handle)) return handle;

  // One scan, reused for both views of it. This used to issue two full
  // cross-partition queries per dashboard load.
  const records = await fetchRecords(handle.container);
  const resources = [...records.extract.values()];
  const documents = await listDocuments(handle.container, records);
  const num = (pick: (r: ExtractItem) => number | undefined) =>
    resources.map(pick).filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const processed = documents.filter((d) => d.uiStatus === "Processed").length;
  const pendingReview = documents.filter(
    (d) => d.needsReview && d.reviewStatus !== "approved" && d.reviewStatus !== "rejected" && d.uiStatus !== "Processed"
  ).length;
  const reviewed = documents.filter((d) => d.reviewStatus === "approved" || d.uiStatus === "Processed").length;
  const stp = processed;

  return {
    status: 200,
    body: {
      ok: true,
      stats: {
        documents: documents.length,
        processed,
        pendingReview,
        reviewed,
        stpCount: stp,
        stpRate: documents.length > 0 ? stp / documents.length : null,
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

async function handleIvrWriteback(body: Record<string, unknown>): Promise<ApiResult> {
  const documentId =
    typeof body.documentId === "string"
      ? body.documentId.trim()
      : typeof body.document_id === "string"
      ? body.document_id.trim()
      : "";
  if (!documentId) return fail(400, "documentId is required.");

  const handle = await requireContainer();
  if (isFail(handle)) return handle;

  const rawFields = body.fields;
  const corrections: Record<string, unknown> = {};
  if (Array.isArray(rawFields)) {
    for (const f of rawFields) {
      if (f && typeof f === "object" && typeof f.field === "string" && f.value !== undefined && f.value !== null) {
        corrections[f.field] = f.value;
      }
    }
  } else if (rawFields && typeof rawFields === "object") {
    for (const [k, v] of Object.entries(rawFields)) {
      if (v !== undefined && v !== null) {
        const val = typeof v === "object" && v !== null && "value" in v ? (v as { value: unknown }).value : v;
        corrections[k] = val;
      }
    }
  }

  const reqId = body.request_id ?? body.requestId;
  await applyReviewAction(handle.container, documentId, {
    type: "approve",
    by: IVR_IDENTITY,
    corrections,
    note: `Settled via IVR writeback${reqId ? ` (request #${reqId})` : ""}`,
  });

  return {
    status: 200,
    body: {
      ok: true,
      documentId,
      uiStatus: "Processed",
      settledCount: Object.keys(corrections).length,
    },
  };
}

async function handleHealth(): Promise<ApiResult> {
  const ivr = ivrHealthPublic();
  const config = readConfig();
  if (isConfigError(config)) {
    return { status: 200, body: { ok: false, configured: false, missing: config.missing, ...ivr } };
  }
  const handle = await requireContainer();
  if (isFail(handle)) {
    return { status: handle.status, body: { ...(handle.body as object), ...ivr } };
  }
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
        ...ivr,
      },
    };
  } catch (error) {
    return fail(502, `Cosmos read failed: ${String(error)}`);
  }
}

async function getObservabilityFromCosmos(limitNum: number, runIdFilter?: string): Promise<ApiResult> {
  const handle = await requireContainer();
  if (isFail(handle)) return handle;

  let queryText = "SELECT * FROM c WHERE (c.itemType = 'ocr' OR c.itemType = 'extract')";
  const parameters: { name: string; value: string }[] = [];
  if (runIdFilter) {
    queryText += " AND c.runId = @runId";
    parameters.push({ name: "@runId", value: runIdFilter });
  }

  let resources: (OcrItem | ExtractItem)[] = [];
  try {
    const res = await handle.container.items
      .query<OcrItem | ExtractItem>({ query: queryText, parameters })
      .fetchAll();
    resources = res.resources;
  } catch (error) {
    return fail(502, `Cosmos observability query failed: ${String(error)}`);
  }

  resources.sort((a, b) => {
    const ta = a.recorded_at || "";
    const tb = b.recorded_at || "";
    return String(tb).localeCompare(String(ta));
  });

  const sliced = resources.slice(0, limitNum);
  const records = sliced.map((r) => {
    const anyR = r as Record<string, unknown>;
    return {
      run_id: r.runId || (anyR.run_id as string) || "prod",
      doc_id: r.docId || (anyR.doc_id as string) || r.documentId || "",
      stage: r.itemType === "ocr" ? "ocr" : "extract",
      status: r.status,
      trace_id: anyR.trace_id as string | undefined,
      span_id: anyR.span_id as string | undefined,
      trace_context: anyR.trace_context as Record<string, string> | undefined,
      business_baggage: (anyR.business_baggage as { run_id?: string; doc_id?: string }) || { run_id: r.runId, doc_id: r.docId },
      queue_wait_ms: typeof anyR.queue_wait_ms === "number" ? anyR.queue_wait_ms : null,
      genai_tool_call_dropout: Boolean(anyR.genai_tool_call_dropout),
      error_message: anyR.error_message as string | undefined,
      recorded_at: anyR.recorded_at,
      model_deployment: (r as ExtractItem).model_deployment,
      cu_latency_ms: (r as OcrItem).cu_latency_ms,
      ivr_trigger_status: anyR.ivr_trigger_status as string | undefined,
    };
  });

  const queueWaits = records
    .map((r) => r.queue_wait_ms)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const dropoutCount = records.filter((r) => r.genai_tool_call_dropout).length;
  const failureCount = records.filter(
    (r) => Boolean(r.error_message) || ["Failed", "ContentFiltered", "PollTimeout"].includes(r.status ?? "")
  ).length;

  const cuRecords = records.filter((r) => r.stage === "ocr" && r.cu_latency_ms != null);
  const llmRecords = records.filter((r) => r.stage === "extract" && r.model_deployment);
  const ivrRecords = records.filter((r) => r.stage === "extract" && r.ivr_trigger_status);

  const avgQueueWait = queueWaits.length ? Math.round((queueWaits.reduce((a, b) => a + b, 0) / queueWaits.length) * 100) / 100 : null;
  const maxQueueWait = queueWaits.length ? Math.max(...queueWaits) : null;

  const dependencyTelemetry = {
    service_bus: {
      available: true,
      queue_wait_samples: queueWaits.length,
      queue_wait_avg_ms: avgQueueWait,
      queue_wait_max_ms: maxQueueWait,
    },
    content_understanding: {
      available: cuRecords.length > 0,
      observed: cuRecords.length,
      failures: cuRecords.filter((r) => ["Failed", "SubmitFailed", "PollTimeout"].includes(r.status ?? "")).length,
    },
    azure_openai: {
      available: llmRecords.length > 0,
      observed: llmRecords.length,
      dropouts: dropoutCount,
    },
    ivr: {
      available: ivrRecords.length > 0,
      observed: ivrRecords.length,
      failures: ivrRecords.filter((r) => ["failed", "rejected", "unauthorized"].includes(r.ivr_trigger_status ?? "")).length,
    },
  };

  return {
    status: 200,
    body: {
      ok: true,
      live: true,
      records,
      sampling: { sampler: "parentbased_traceidratio", ratio: 0.1 },
      retention_days: 30,
      aggregates: {
        record_count: records.length,
        failure_count: failureCount,
        genai_dropout_count: dropoutCount,
        queue_wait_avg_ms: avgQueueWait,
        queue_wait_max_ms: maxQueueWait,
      },
      dependency_telemetry: dependencyTelemetry,
    },
  };
}

// --- sessions ------------------------------------------------------------------
async function handleLogin(body: Record<string, unknown>): Promise<ApiResult> {
  const secret = jwtSecret();
  if (!secret) return fail(503, "Sign-in is not configured on the server (PACCA_JWT_SECRET, 32+ characters).");
  const result = await login(body.email, body.password);
  if (!result.ok) return fail(result.status, result.error);
  return {
    status: 200,
    body: { ok: true, user: result.user },
    headers: { "Set-Cookie": sessionCookie(signSession(result.user, secret)) },
  };
}

function handleMe(ctx: RequestContext): ApiResult {
  const user = currentUser(ctx);
  return user ? { status: 200, body: { ok: true, user } } : fail(401, "Not signed in.");
}

function handleLogout(): ApiResult {
  return { status: 200, body: { ok: true }, headers: { "Set-Cookie": clearedSessionCookie() } };
}

/**
 * Who may call what. Checked before any handler runs; a route missing from
 * this table is a 404 whether or not it exists, so a new route cannot ship
 * unprotected by forgetting to list it.
 *
 *   public   no session (health, sign-in)
 *   machine  the IVR system's callback: x-api-key when IVR_WRITEBACK_API_KEY
 *            is set (it has no user session to present)
 *   <Role>   that role or higher. Staff < Solution Developer < Platform Admin
 *
 * The client builds its tabs from the same matrix (rolePermissions in
 * client/src/components/Auth.tsx).
 * Hiding a tab is presentation; this table is the control.
 */
export const ROUTE_POLICY: Record<string, Role | "public" | "machine"> = {
  "POST /login": "public",
  "POST /logout": "public",
  "GET /me": "public",
  "GET /health": "public",

  "GET /documents": STAFF,
  "GET /document": STAFF,
  "GET /stats": STAFF,
  "GET /schema": STAFF,
  "POST /upload-sas": STAFF,
  "POST /review": STAFF,
  "POST /ivr-trigger": STAFF,
  "GET /ivr-outreach": STAFF,

  "GET /observability": DEVELOPER,
  "GET /observability/gaps": DEVELOPER,
  "GET /observability-gaps": DEVELOPER,
  "POST /observability/chat": DEVELOPER,
  "POST /observability-chat": DEVELOPER,
  "POST /observability/diagnose": DEVELOPER,
  "POST /observability-diagnose": DEVELOPER,
  "POST /kql": DEVELOPER,
  "POST /schemas/sync": DEVELOPER,

  "GET /analytics": ADMIN,

  "POST /ivr-writeback": "machine",
  "POST /ivr-webhook": "machine",
};

async function handleObservability(query: URLSearchParams): Promise<ApiResult> {
  const config = readConfig();
  if (isConfigError(config)) return fail(503, config.error, { missing: config.missing });
  const limit = Math.min(Math.max(parseInt(query.get("limit") || "50", 10) || 50, 1), 200);
  const runId = query.get("runId") || "";

  if (config.functionUrl && config.functionKey) {
    try {
      const endpoint = new URL("/api/observability", config.functionUrl);
      endpoint.searchParams.set("limit", String(limit));
      if (runId) endpoint.searchParams.set("run_id", runId);
      endpoint.searchParams.set("code", config.functionKey);

      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json();
      if (response.ok) return { status: 200, body: { ok: true, live: true, ...body } };
    } catch {
      // Fall through to Cosmos DB computation
    }
  }

  return getObservabilityFromCosmos(limit, runId);
}

export async function handleSenderra(
  method: string,
  path: string,
  query: URLSearchParams,
  body: Record<string, unknown>,
  ctx: RequestContext = {}
): Promise<ApiResult> {
  const route = `/${path.replace(/^\/+|\/+$/g, "")}`;

  const policy = ROUTE_POLICY[`${method} ${route}`];
  if (!policy) return fail(404, `No Senderra route ${method} ${route}.`);
  if (policy === "machine") {
    const machine = authorizeMachine(ctx, "IVR_WRITEBACK_API_KEY");
    if (!machine.ok) return fail(machine.status, machine.error);
  } else if (policy !== "public") {
    const auth = authorize(ctx, policy);
    if (!auth.ok) return fail(auth.status, auth.error);
    // The acting identity is the session, never whatever the body claims.
    if (route === "/review" || route === "/ivr-trigger") body = { ...body, by: auth.user.email };
  }

  try {
    // Single-segment on purpose: multi-segment routes under the Vercel
    // catch-all have 404'd before (see api/senderra/observability/).
    if (method === "POST" && route === "/login") return await handleLogin(body);
    if (method === "POST" && route === "/logout") return handleLogout();
    if (method === "GET" && route === "/me") return handleMe(ctx);

    if (method === "GET" && route === "/health") return await handleHealth();
    if (method === "GET" && route === "/documents") return await handleDocuments(query);
    if (method === "GET" && route === "/document") return await handleDocument(query);
    if (method === "GET" && route === "/stats") return await handleStats();
     if (method === "GET" && route === "/analytics") return await handleAnalytics();
     if (method === "GET" && route === "/observability") return await handleObservability(query);

    if (method === "POST" && route === "/upload-sas") return await handleUploadSas(body);
    if (method === "POST" && route === "/review") return await handleReview(body);
    if (method === "POST" && route === "/ivr-trigger") return await handleIvrTrigger(body);
    if (method === "GET" && route === "/ivr-outreach") return await handleIvrOutreach(query);
    if (method === "POST" && (route === "/ivr-writeback" || route === "/ivr-webhook")) return await handleIvrWriteback(body);
    if (method === "GET" && route === "/schema") {
      const docType = query.get("docType") || query.get("type") || "referralForm";
      const res = await getDynamicSchema(docType);
      return { status: res.ok ? 200 : 404, body: res };
    }
    if (method === "POST" && route === "/schemas/sync") {
      const res = await syncSchemasToBlob();
      return { status: res.ok ? 200 : 500, body: res };
    }
    if (method === "POST" && (route === "/observability/chat" || route === "/observability-chat")) {
      return await handleObservabilityChat(body as any);
    }
    if (method === "POST" && route === "/kql") {
      const queryStr = String(body.query || "");
      const res = await executeKql(queryStr);
      return { status: res.ok ? 200 : 400, body: res };
    }
    if (method === "GET" && (route === "/observability/gaps" || route === "/observability-gaps")) {
      const runIdFilter = query.get("runId") || undefined;
      const result = await detectPipelineGaps(runIdFilter);
      return { status: 200, body: result };
    }
    if (method === "POST" && (route === "/observability/diagnose" || route === "/observability-diagnose")) {
      // Targeted document diagnosis: run gap detection + KQL for a specific doc
      const docId = String(body.docId || "");
      const runId = String(body.runId || "");
      const [gapResult, traceResult, exceptionResult] = await Promise.all([
        detectPipelineGaps(runId || undefined),
        executeKql(
          docId
            ? `traces | where doc_id contains "${docId}" | order by timestamp desc | take 20`
            : `traces | order by timestamp desc | take 20`
        ),
        executeKql(
          docId
            ? `exceptions | where doc_id contains "${docId}" | take 10`
            : `exceptions | take 10`
        ),
      ]);
      const docGaps = gapResult.gaps.filter(
        (g) => !docId || g.docId.includes(docId) || g.documentId.includes(docId)
      );
      return {
        status: 200,
        body: {
          ok: true,
          docId,
          runId,
          gaps: docGaps,
          traces: traceResult.rows,
          exceptions: exceptionResult.rows,
          pipelineSummary: {
            blobCount: gapResult.blobCount,
            cosmosCount: gapResult.cosmosCount,
            eventGridGaps: gapResult.eventGridGaps,
            ocrStuck: gapResult.ocrStuck,
            extractMissing: gapResult.extractMissing,
            estimatedDlqDepth: gapResult.estimatedDlqDepth,
          },
        },
      };
    }
    return fail(404, `No Senderra route ${method} ${route}.`);
  } catch (error) {
    return fail(500, String(error));
  }
}
