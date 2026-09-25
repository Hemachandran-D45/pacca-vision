import { container } from "./cosmos.js";
import type { ExtractItem, OcrItem } from "./types.js";
import { detectPipelineGaps } from "./pipelineGaps.js";
import { isConfigError, readConfig } from "./config.js";
import { listRecentUploads } from "./blob.js";

export type KqlQueryResult = {
  ok: boolean;
  query: string;
  executionTimeMs: number;
  totalRows: number;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  summary?: string;
  error?: string;
};

type TraceRow = {
  timestamp: string;
  itemType: string;
  stage: string;
  run_id: string;
  doc_id: string;
  status: string;
  message: string;
  e2e_latency_ms: number | null;
  queue_wait_ms: number | null;
  model_deployment?: string;
  field_score_mean?: number | null;
  cache_hit_frac?: number | null;
  genai_tool_call_dropout?: boolean;
  error_message?: string;
  trace_id?: string;
  span_id?: string;
  [key: string]: unknown;
};

/** Build the virtual in-memory observability table from Cosmos DB records */
export async function loadObservabilityDataset(): Promise<{
  traces: TraceRow[];
  exceptions: Array<{ timestamp: string; run_id: string; doc_id: string; stage: string; error_message: string; trace_id?: string }>;
  dependencies: Array<{ timestamp: string; type: string; target: string; latency_ms: number; success: boolean; trace_id?: string }>;
}> {
  const traces: TraceRow[] = [];
  const exceptions: Array<{ timestamp: string; run_id: string; doc_id: string; stage: string; error_message: string; trace_id?: string }> = [];
  const dependencies: Array<{ timestamp: string; type: string; target: string; latency_ms: number; success: boolean; trace_id?: string }> = [];

  try {
    const handle = await container();
    if (!("error" in handle)) {
      const { resources } = await handle.container.items
        .query<OcrItem | ExtractItem>({
          query: "SELECT * FROM c WHERE (c.itemType = 'ocr' OR c.itemType = 'extract') ORDER BY c._ts DESC",
        })
        .fetchAll();

      for (const item of resources) {
        const anyItem = item as Record<string, unknown>;
        const ts = item.recorded_at || new Date().toISOString();
        const runId = item.runId || (anyItem.run_id as string) || "prod";
        const docId = item.docId || (anyItem.doc_id as string) || item.documentId || "unknown";
        const stage = item.itemType === "ocr" ? "ocr" : "extract";
        const isDropout = Boolean(anyItem.genai_tool_call_dropout);
        const err = (anyItem.error_message as string) || (item.status === "Failed" ? "Stage failed" : undefined);
        const traceId = (anyItem.trace_id as string) || (anyItem.trace as string) || `0x${Math.random().toString(16).slice(2, 10)}`;

        const message = `bench|${stage}|${JSON.stringify({
          run_id: runId,
          doc_id: docId,
          stage,
          status: item.status,
          e2e_latency_ms: item.e2e_latency_ms,
          queue_wait_ms: (item as any).queue_wait_ms,
          model_deployment: (item as ExtractItem).model_deployment,
          field_score_mean: (item as ExtractItem).field_score_mean,
          cache_hit_frac: (item as ExtractItem).cache_hit_frac,
          genai_tool_call_dropout: isDropout,
          error_message: err,
        })}`;

        traces.push({
          timestamp: ts,
          itemType: item.itemType,
          stage,
          run_id: runId,
          doc_id: docId,
          status: item.status || "Unknown",
          message,
          e2e_latency_ms: typeof item.e2e_latency_ms === "number" ? item.e2e_latency_ms : null,
          queue_wait_ms: typeof (item as any).queue_wait_ms === "number" ? (item as any).queue_wait_ms : null,
          model_deployment: (item as ExtractItem).model_deployment,
          field_score_mean: typeof (item as ExtractItem).field_score_mean === "number" ? (item as ExtractItem).field_score_mean : null,
          cache_hit_frac: typeof (item as ExtractItem).cache_hit_frac === "number" ? (item as ExtractItem).cache_hit_frac : null,
          genai_tool_call_dropout: isDropout,
          error_message: err,
          trace_id: traceId,
          span_id: (anyItem.span_id as string) || undefined,
        });

        if (err || item.status === "Failed" || item.status === "ContentFiltered") {
          exceptions.push({
            timestamp: ts,
            run_id: runId,
            doc_id: docId,
            stage,
            error_message: err || `Terminal error in stage ${stage}`,
            trace_id: traceId,
          });
        }

        // Add dependency spans
        if (stage === "ocr") {
          dependencies.push({
            timestamp: ts,
            type: "Azure Cognitive Services",
            target: "Content Understanding (pacca_layout.v1)",
            latency_ms: (item as OcrItem).cu_latency_ms || item.e2e_latency_ms || 400,
            success: item.status !== "Failed" && item.status !== "SubmitFailed",
            trace_id: traceId,
          });
        } else if (stage === "extract") {
          dependencies.push({
            timestamp: ts,
            type: "Azure OpenAI",
            target: (item as ExtractItem).model_deployment || "gpt-5.4-mini",
            latency_ms: item.e2e_latency_ms || 650,
            success: !isDropout && item.status !== "Failed" && item.status !== "ContentFiltered",
            trace_id: traceId,
          });
        }
      }
    }
  } catch (e) {
    console.warn("KQL Engine: could not read Cosmos container:", e);
  }

  return { traces, exceptions, dependencies };
}

/** Execute a KQL query against the in-memory telemetry plane */
export async function executeKql(rawQuery: string): Promise<KqlQueryResult> {
  const t0 = performance.now();
  const query = rawQuery.trim();

  if (!query) {
    return {
      ok: false,
      query,
      executionTimeMs: 0,
      totalRows: 0,
      columns: [],
      rows: [],
      error: "Query is empty.",
    };
  }

  try {
    const dataset = await loadObservabilityDataset();
    const lines = query
      .split("|")
      .map((l) => l.trim())
      .filter(Boolean);

    if (!lines.length) throw new Error("Invalid KQL syntax.");

    // 1. Identify base table
    const firstToken = lines[0].toLowerCase();
    let currentRows: Array<Record<string, unknown>> = [];

    if (firstToken.startsWith("pipeline_gaps") || firstToken.startsWith("gaps")) {
      // Virtual table: blob vs Cosmos reconciliation
      const gapSummary = await detectPipelineGaps();
      currentRows = gapSummary.gaps.map((g) => ({
        gapId: g.gapId,
        timestamp: g.uploadedAt ?? g.lastCosmosTs ?? new Date().toISOString(),
        severity: g.severity,
        category: g.category,
        documentId: g.documentId,
        run_id: g.runId,
        doc_id: g.docId,
        blobPath: g.blobPath,
        uploadedAt: g.uploadedAt,
        stuckForMs: g.stuckForMs,
        ocrStatus: g.ocrStatus ?? "—",
        extractStatus: g.extractStatus ?? "—",
        lastCosmosTs: g.lastCosmosTs,
        rootCauseHypothesis: g.rootCauseHypothesis,
        remediation: g.remediation,
        investigateKql: g.investigateKql,
      }));
    } else if (firstToken.startsWith("blobs")) {
      // Virtual table: raw blob listing from docs-in blob container
      const config = readConfig();
      if (!isConfigError(config)) {
        try {
          const rawBlobs = await listRecentUploads(config);
          currentRows = rawBlobs.map((b) => ({
            timestamp: b.uploadedAt ?? new Date().toISOString(),
            documentId: b.documentId,
            runId: b.documentId.includes("/") ? b.documentId.split("/")[0] : config.uploadRunId || "prod",
            docId: b.documentId.includes("/") ? b.documentId.split("/").slice(1).join("/") : b.documentId,
            name: b.documentId.split("/").pop() || b.documentId,
            blobPath: b.blobPath,
            container: config.docsContainer,
            size: b.size,
            uploadedAt: b.uploadedAt,
            createdAt: b.uploadedAt,
          }));
        } catch {
          currentRows = [];
        }
      } else {
        currentRows = [];
      }
    } else if (firstToken.startsWith("exceptions")) {
      currentRows = [...dataset.exceptions];
    } else if (firstToken.startsWith("dependencies")) {
      currentRows = [...dataset.dependencies];
    } else {
      // Default to traces
      currentRows = [...dataset.traces];
    }

    // 2. Process pipeline operators
    for (let i = 1; i < lines.length; i++) {
      const opLine = lines[i];
      const opLower = opLine.toLowerCase();

      if (opLower.startsWith("where")) {
        const conditionStr = opLine.slice(5).trim();
        currentRows = applyKqlWhere(currentRows, conditionStr);
      } else if (opLower.startsWith("project")) {
        const fields = opLine
          .slice(7)
          .split(",")
          .map((f) => f.trim().split("=").pop()!.trim().replace(/^tostring\(|\)$/gi, ""));
        currentRows = currentRows.map((row) => {
          const projected: Record<string, unknown> = {};
          for (const f of fields) {
            const cleanKey = f.split(".").pop() || f;
            projected[cleanKey] = row[cleanKey] !== undefined ? row[cleanKey] : row[f];
          }
          return projected;
        });
      } else if (opLower.startsWith("summarize")) {
        currentRows = applyKqlSummarize(currentRows, opLine.slice(9).trim());
      } else if (opLower.startsWith("order by") || opLower.startsWith("sort by")) {
        const orderExpr = opLine.replace(/^(order|sort)\s+by\s+/i, "").trim();
        const [field, dir] = orderExpr.split(/\s+/);
        const isDesc = dir?.toLowerCase() === "desc" || !dir;
        currentRows.sort((a, b) => {
          const va = a[field];
          const vb = b[field];
          if (va == null) return isDesc ? 1 : -1;
          if (vb == null) return isDesc ? -1 : 1;
          if (typeof va === "number" && typeof vb === "number") return isDesc ? vb - va : va - vb;
          return isDesc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
        });
      } else if (opLower.startsWith("take") || opLower.startsWith("limit")) {
        const count = parseInt(opLine.replace(/^(take|limit)\s+/i, "").trim(), 10) || 50;
        currentRows = currentRows.slice(0, count);
      }
    }

    const executionTimeMs = Math.round((performance.now() - t0) * 100) / 100;
    const columns = currentRows.length > 0 ? Object.keys(currentRows[0]) : [];

    return {
      ok: true,
      query,
      executionTimeMs,
      totalRows: currentRows.length,
      columns,
      rows: currentRows.slice(0, 100),
      summary: `Returned ${currentRows.length} record(s) in ${executionTimeMs} ms across telemetry plane.`,
    };
  } catch (err: any) {
    return {
      ok: false,
      query,
      executionTimeMs: Math.round((performance.now() - t0) * 100) / 100,
      totalRows: 0,
      columns: [],
      rows: [],
      error: String(err?.message || err),
    };
  }
}

function applyKqlWhere(rows: Array<Record<string, unknown>>, expr: string): Array<Record<string, unknown>> {
  return rows.filter((row) => {
    // Check for dropouts
    if (expr.includes("tool_call_dropout == true") || expr.includes("genai_tool_call_dropout")) {
      return Boolean(row.genai_tool_call_dropout);
    }
    // Check for errors / failures
    if (expr.includes("!in") && expr.includes("Succeeded")) {
      return row.status !== "Succeeded" && row.status !== "DuplicateSkipped";
    }
    if (expr.includes("status != 'Succeeded'") || expr.includes('status != "Succeeded"')) {
      return row.status !== "Succeeded";
    }
    // Check for stage match
    const stageMatch = expr.match(/stage\s*==\s*["']([^"']+)["']/i);
    if (stageMatch && row.stage !== stageMatch[1]) return false;

    // Check for run_id match
    const runMatch = expr.match(/run_id\s*==\s*["']([^"']+)["']/i);
    if (runMatch && row.run_id !== runMatch[1]) return false;

    // Check for doc_id match
    const docMatch = expr.match(/doc_id\s*(==|contains)\s*["']([^"']+)["']/i);
    if (docMatch) {
      if (docMatch[1] === "==" && row.doc_id !== docMatch[2]) return false;
      if (docMatch[1] === "contains" && !String(row.doc_id).includes(docMatch[2])) return false;
    }

    // Check for queue wait > N
    const queueMatch = expr.match(/queue_wait_ms\s*>\s*(\d+)/i);
    if (queueMatch && (typeof row.queue_wait_ms !== "number" || row.queue_wait_ms <= parseInt(queueMatch[1], 10))) {
      return false;
    }

    // Default contains search
    const containsMatch = expr.match(/contains\s*["']([^"']+)["']/i);
    if (containsMatch) {
      const needle = containsMatch[1].toLowerCase();
      const hasMatch = Object.values(row).some((val) => String(val).toLowerCase().includes(needle));
      if (!hasMatch) return false;
    }

    return true;
  });
}

function applyKqlSummarize(rows: Array<Record<string, unknown>>, summarizeExpr: string): Array<Record<string, unknown>> {
  const parts = summarizeExpr.split(/\s+by\s+/i);
  const byField = parts[1]?.trim().replace(/^tostring\(|\)$/gi, "") || "";

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const key = byField ? String(row[byField] ?? "all") : "global";
    const arr = groups.get(key) || [];
    arr.push(row);
    groups.set(key, arr);
  }

  const resultRows: Array<Record<string, unknown>> = [];
  for (const [key, groupRows] of groups.entries()) {
    const out: Record<string, unknown> = {};
    if (byField) out[byField] = key;
    out["docs"] = groupRows.length;

    const latencies = groupRows
      .map((r) => r.e2e_latency_ms)
      .filter((v): v is number => typeof v === "number");
    const queueWaits = groupRows
      .map((r) => r.queue_wait_ms)
      .filter((v): v is number => typeof v === "number");

    out["avg_latency_ms"] = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
    out["p95_latency_ms"] = latencies.length ? Math.max(...latencies) : null;
    out["avg_queue_wait_ms"] = queueWaits.length ? Math.round(queueWaits.reduce((a, b) => a + b, 0) / queueWaits.length) : null;
    out["dropouts"] = groupRows.filter((r) => r.genai_tool_call_dropout).length;
    out["failures"] = groupRows.filter((r) => r.status !== "Succeeded" && r.status !== "DuplicateSkipped").length;

    resultRows.push(out);
  }

  return resultRows;
}
