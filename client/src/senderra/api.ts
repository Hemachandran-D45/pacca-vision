import { useCallback, useEffect, useRef, useState } from "react";

const BASE = "/api/senderra";

export type DocumentSummary = {
  documentId: string;
  runId: string;
  docId: string;
  file: string;
  docType: string | null;
  pipelineStatus: string;
  uiStatus: "Processed" | "Needs Review" | "In HIL Review" | "Processing" | "Queued" | "Triage" | "Failed";
  confidence: number | null;
  classifyConfidence: number | null;
  pages: number | null;
  fileBytes: number | null;
  needsReview: boolean;
  reviewReasons: string[];
  reviewFields: string[];
  fieldCount: number | null;
  fieldsNeedingReview: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  minPageConfidence: number | null;
  receivedAt: string | null;
  source: string | null;
  reviewStatus: string | null;
  reviewedBy: string | null;
  claimedBy: string | null;
  correctionCount: number;
};

export type ExtractedField = {
  value: string | number | boolean | null;
  quote?: string | null;
  class?: string;
  grounding?: {
    grounded?: boolean;
    match?: string;
    page?: number;
    polygon?: string;
    ocr_confidence?: number;
    ocr_min_confidence?: number;
    quote_in_document?: boolean;
  };
  scores?: {
    model_confidence?: number | null;
    grounding_score?: number | null;
    ocr_score?: number | null;
    field_score?: number | null;
    weakest_signal?: string | null;
  };
  needs_review?: boolean;
  review_reasons?: string[];
};

export type ReviewAudit = {
  at: string;
  by: string;
  action: string;
  field?: string;
  old_value?: unknown;
  new_value?: unknown;
  note?: string | null;
};

export type ReviewItem = {
  status?: string;
  corrections?: Record<string, { value: unknown; by: string; at: string }>;
  audit?: ReviewAudit[];
  claimed_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  note?: string | null;
};

export type DocumentDetail = {
  summary: DocumentSummary;
  ocr: Record<string, unknown> | null;
  extract: Record<string, unknown> | null;
  fields: { docType?: string; fields?: Record<string, ExtractedField> } | null;
  review: ReviewItem | null;
  pdfUrl: string | null;
};

export type SenderraStats = {
  documents: number;
  processed: number;
  pendingReview: number;
  reviewed: number;
  stpCount: number;
  stpRate: number | null;
  avgFieldScore: number | null;
  avgOcrConfidence: number | null;
  avgCacheHit: number | null;
  avgLatencyMs: number | null;
  totalCostUsd: number;
  pagesBilled: number;
  byDocType: { docType: string; count: number }[];
  byStatus: { status: string; count: number }[];
};

/** Every failure the UI can show is an `Error` with the server's own message. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  const body = payload as { ok?: boolean; error?: string };
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `Request failed (${response.status}).`);
  }
  return payload as T;
}

export function fetchDocuments(params: Record<string, string> = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return request<{ documents: DocumentSummary[]; runIds: string[]; docTypes: string[] }>(
    `/documents?${query.toString()}`
  );
}

export function fetchDocument(documentId: string) {
  return request<DocumentDetail>(`/document?documentId=${encodeURIComponent(documentId)}`);
}

export function fetchStats() {
  return request<{ stats: SenderraStats }>("/stats");
}

export type SenderraAnalytics = {
  totals: {
    documents: number; succeeded: number; pagesBilled: number; spendUsd: number;
    cuUsd: number; llmUsd: number; llmUncachedUsd: number; cacheSavingUsd: number;
    costPerDoc: number | null; costPerPage: number | null; costPer1kPages: number | null;
  };
  tokens: { prompt: number; cached: number; completion: number; reasoning: number; cacheHitFrac: number | null };
  latency: {
    queueWaitMs: number | null; stage1Ms: number | null; stage2Ms: number | null;
    cuMs: number | null; classifyMs: number | null; extractMs: number | null;
    pipelineMeanMs: number | null; pipelineMaxMs: number; composedFloor: boolean;
  };
  quality: {
    stpRate: number | null; stpCount: number; avgFieldScore: number | null;
    avgGroundedFrac: number | null; quoteNotFound: number; fieldsNeedingReview: number;
    fieldsTotal: number; avgOcrConf: number | null; minPageConfidence: number;
  };
  gates: { documentReasons: { reason: string; count: number }[]; fieldReasons: { reason: string; count: number }[] };
  byDocType: {
    docType: string; count: number; spendUsd: number; avgCostUsd: number | null;
    avgFieldScore: number | null; pages: number; needsReview: number;
  }[];
  confidenceHistogram: { label: string; count: number }[];
  costTrend: { day: string; spend: number; documents: number }[];
  guards: {
    contextualizationUsd: number; contextualizationTokens: number; pagesBasic: number;
    pagesStandard: number; throttleCount: number; analyzers: string[]; models: string[];
  };
};

export function fetchAnalytics() {
  return request<{ analytics: SenderraAnalytics }>("/analytics");
}

export function fetchHealth() {
  return request<{ configured: boolean; cosmos?: string; storage?: string; uploadRunId?: string }>(
    "/health"
  );
}

export type UploadGrant = {
  blobName: string;
  documentId: string;
  container: string;
  uploadUrl: string;
};

export function mintUploadGrants(files: { name: string }[], runId?: string) {
  return request<{ runId: string; container: string; grants: UploadGrant[] }>("/upload-sas", {
    method: "POST",
    body: JSON.stringify({ files, ...(runId ? { runId } : {}) }),
  });
}

/**
 * PUT straight to Azure Blob Storage with the minted SAS.
 *
 * The bytes never touch our API — Vercel caps a serverless request body at
 * 4.5 MB and a multi-page scan is routinely larger. `x-ms-blob-type` is not
 * optional: without it the service rejects the PUT with 400, because it has no
 * way to know whether this is a block, page or append blob.
 */
export async function uploadToBlob(grant: UploadGrant, file: File): Promise<void> {
  const response = await fetch(grant.uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": file.type || "application/pdf",
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status} ${response.statusText}).`);
  }
}

export function postReview(payload: {
  documentId: string;
  action: "claim" | "release" | "correct" | "approve" | "reject";
  by: string;
  note?: string | null;
  corrections?: Record<string, unknown>;
}) {
  return request<{ review: ReviewItem }>("/review", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Poll-based live data.
 *
 * Polling rather than a socket is a deliberate limit, not a shortcut: a
 * document takes 20-40 seconds end to end, so a 5-second tick is well inside
 * the resolution anyone can perceive, and it survives any serverless host.
 * The in-flight guard matters — a slow Cosmos scan under a fast interval would
 * otherwise stack requests until the browser's connection pool is exhausted.
 */
export function usePolled<T>(
  load: () => Promise<T>,
  intervalMs: number | null,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await loadRef.current();
      if (!mounted.current) return;
      setData(next);
      setError(null);
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void refresh();
    if (intervalMs === null) return () => { mounted.current = false; };
    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);

  return { data, error, loading, refresh };
}

// ---------------------------------------------------------------------------
// Presentation helpers, shared by every live surface
// ---------------------------------------------------------------------------

/**
 * Two tokens per status, not one.
 *
 * `STATUS_COLOR` is the chip and dot fill - vivid, so the state reads at a
 * glance. `STATUS_INK` is the same hue darkened until the label clears WCAG AA
 * against the 10% tint it sits on; the vivid values measure 2.1:1 to 4.3:1 as
 * text, which is unreadable for the amber ones. Every status is always rendered
 * with its label, so colour is reinforcement and never the sole encoding.
 */
export const STATUS_COLOR: Record<DocumentSummary["uiStatus"], string> = {
  Processed: "#1f9b72",
  "Needs Review": "#ed9a25",
  "In HIL Review": "#7c5cd6",
  Processing: "#4779de",
  Queued: "#8496ad",
  Triage: "#c2761c",
  Failed: "#d6455d",
};

export const STATUS_INK: Record<DocumentSummary["uiStatus"], string> = {
  Processed: "#0e6b4d",
  "Needs Review": "#8a5606",
  "In HIL Review": "#5733a6",
  Processing: "#2a52a0",
  Queued: "#495a70",
  Triage: "#8a5209",
  Failed: "#a3213a",
};

/** Human labels for the pipeline's reason codes. The codes stay authoritative. */
export const REASON_LABEL: Record<string, string> = {
  extraction_needs_review: "Field extraction below threshold",
  classification_needs_review: "Document type uncertain",
  ocr_needs_review: "Page legibility below floor",
  low_model_confidence: "Low model confidence",
  low_ocr_confidence: "Low OCR confidence",
  ungrounded: "Quote not found in document",
  weak_grounding: "Weak grounding match",
};

export const FIELD_CLASS_LABEL: Record<string, string> = {
  A: "Class A · deterministic anchor",
  B: "Class B · derived",
  C: "Class C · inference",
};

export function percent(value: number | null | undefined, digits = 0): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function usd(value: number | null | undefined, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(digits)}`;
}

export function duration(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function bytes(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Prettifies `doc_type_predicted` / field names without hiding the real token. */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
