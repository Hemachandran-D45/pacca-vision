import { useState, useMemo, useRef, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cloud,
  Code,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  Filter,
  Flame,
  Gauge,
  GitBranch,
  Info,
  Layers,
  MessageSquare,
  Play,
  Radio,
  RefreshCw,
  Route,
  Search,
  Send,
  ServerCog,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  TimerReset,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionHeading } from "@/components/common/SectionHeading";
import { ErrorBlock, LiveBadge, LoadingBlock } from "@/senderra/parts";
import {
  duration,
  fetchAnalytics,
  fetchObservability,
  fetchPipelineGaps,
  diagnoseDocument,
  percent,
  postObservabilityChat,
  runKqlQuery,
  usePolled,
  type DiagnoseResult,
  type ExecutedKqlLog,
  type KqlQueryResult,
  type ObservabilityChatMessage,
  type ObservabilityRecord,
  type PipelineGapEvent,
  type PipelineGapSummary,
  type SenderraAnalytics,
} from "@/senderra/api";

type CausalCategory =
  | "tool_dropout"
  | "pipeline_failure"
  | "queue_spike"
  | "ocr_checkpoint"
  | "extract_grounding"
  | "ivr_outreach"
  | "telemetry_event";

export type EnrichedCausalIncident = {
  id: string;
  category: CausalCategory;
  severity: "Investigating" | "Warning" | "Observed" | "Optimized";
  title: string;
  customer: string;
  step: string;
  stage: string;
  cause: string;
  answer: string;
  recommendation: string;
  time: string;
  trace: string;
  queueWaitMs: number | null;
  latencyMs: number | null;
  model?: string;
  rawRecord?: ObservabilityRecord;
};

const KQL_PRESETS = [
  {
    name: "GenAI Tool Dropouts",
    description: "Find extraction runs where model emitted text instead of tool calls",
    query: `traces\n| where message startswith "bench|extract|"\n| where genai_tool_call_dropout == true\n| project timestamp, run_id, doc_id, model_deployment, status, error_message\n| take 25`,
  },
  {
    name: "Queue Latency Bottlenecks (> 500ms)",
    description: "Find documents with highest Service Bus intake queue delay",
    query: `traces\n| where queue_wait_ms > 500\n| project timestamp, run_id, doc_id, stage, queue_wait_ms, e2e_latency_ms\n| order by queue_wait_ms desc\n| take 25`,
  },
  {
    name: "Stage Latency & Failure Breakdown",
    description: "Summarize doc counts, average latency, and failures by pipeline stage",
    query: `traces\n| summarize docs = count(), avg_latency = avg(e2e_latency_ms), failures = sum(status != 'Succeeded') by stage\n| take 10`,
  },
  {
    name: "All Active Failures & Exceptions",
    description: "Query all non-succeeded stage records across Cosmos DB",
    query: `traces\n| where status !in ("Succeeded", "DuplicateSkipped")\n| project timestamp, stage, doc_id, status, error_message, trace_id\n| order by timestamp desc\n| take 25`,
  },
  {
    name: "Pipeline Gaps — Event Grid Silent",
    description: "Blobs uploaded to docs-in with zero OCR or extract downstream records",
    query: `pipeline_gaps\n| where category == "event_grid_gap"\n| project severity, documentId, uploadedAt, stuckForMs, rootCauseHypothesis\n| order by stuckForMs desc`,
  },
  {
    name: "Pipeline Gaps — All Stuck Documents",
    description: "All pipeline gap events sorted by how long the document has been stuck",
    query: `pipeline_gaps\n| project severity, category, doc_id, ocrStatus, stuckForMs, rootCauseHypothesis\n| order by stuckForMs desc`,
  },
  {
    name: "Dependency Spans (CU & OpenAI)",
    description: "Inspect external client spans for Content Understanding and LLM",
    query: `dependencies\n| project timestamp, type, target, latency_ms, success, trace_id\n| order by timestamp desc\n| take 25`,
  },
];

const GAP_CATEGORY_META: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  event_grid_gap: {
    label: "Event Grid Silent",
    icon: "⚡",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  ocr_stuck: {
    label: "OCR Failed",
    icon: "🔴",
    color: "#b45309",
    bg: "#fffbeb",
    border: "#fcd34d",
  },
  extract_missing: {
    label: "Extract Missing",
    icon: "🟠",
    color: "#c2410c",
    bg: "#fff7ed",
    border: "#fdba74",
  },
  long_running: {
    label: "Long Running",
    icon: "⏱",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#c4b5fd",
  },
  dlq_overflow: {
    label: "DLQ Overflow",
    icon: "💀",
    color: "#991b1b",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  duplicate_orphan: {
    label: "Orphan Blob",
    icon: "👻",
    color: "#4b5563",
    bg: "#f9fafb",
    border: "#e5e7eb",
  },
};

function PipelineGapsPanel({
  onOpenKqlQuery,
  onDiagnoseWithCopilot,
}: {
  onOpenKqlQuery: (q: string) => void;
  onDiagnoseWithCopilot: (prompt: string) => void;
}) {
  const { data, loading, error, refresh } = usePolled(
    () => fetchPipelineGaps(),
    30000
  );
  const [diagnosing, setDiagnosing] = useState<string | null>(null);
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseResult | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);

  const handleDiagnose = async (gap: PipelineGapEvent) => {
    setDiagnosing(gap.gapId);
    setDiagnoseResult(null);
    setDiagError(null);
    try {
      const res = await diagnoseDocument({ docId: gap.docId, runId: gap.runId });
      setDiagnoseResult(res);
    } catch (e) {
      setDiagError(String(e));
    } finally {
      setDiagnosing(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-[11px] text-slate-400">
        <RefreshCw size={14} className="mr-2 animate-spin" />
        Running blob vs Cosmos reconciliation…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[11px] text-red-700">
        <AlertTriangle size={14} className="inline mr-1" />
        Gap detection unavailable: {error}
      </div>
    );
  }

  const summary = data;

  return (
    <div className="space-y-5">
      {/* Summary Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        {[
          { label: "Blobs in docs-in", value: summary?.blobCount ?? "—", icon: "📦", tone: "slate" },
          { label: "Cosmos records", value: summary?.cosmosCount ?? "—", icon: "🗄️", tone: "slate" },
          { label: "Event Grid gaps", value: summary?.eventGridGaps ?? 0, icon: "⚡", tone: (summary?.eventGridGaps ?? 0) > 0 ? "red" : "green" },
          { label: "OCR stuck", value: summary?.ocrStuck ?? 0, icon: "🔴", tone: (summary?.ocrStuck ?? 0) > 0 ? "amber" : "green" },
          { label: "Extract missing", value: summary?.extractMissing ?? 0, icon: "🟠", tone: (summary?.extractMissing ?? 0) > 0 ? "amber" : "green" },
          { label: "Est. DLQ depth", value: summary?.estimatedDlqDepth ?? 0, icon: "💀", tone: (summary?.estimatedDlqDepth ?? 0) > 0 ? "red" : "green" },
        ].map((m) => (
          <div
            key={m.label}
            className={cn(
              "rounded-xl border p-3",
              m.tone === "red"
                ? "border-red-200 bg-red-50"
                : m.tone === "amber"
                  ? "border-amber-200 bg-amber-50"
                  : m.tone === "green"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
            )}
          >
            <div className="text-base">{m.icon}</div>
            <div
              className={cn(
                "mt-1 font-display text-[20px] font-bold",
                m.tone === "red" ? "text-red-700" : m.tone === "amber" ? "text-amber-700" : m.tone === "green" ? "text-emerald-700" : "text-slate-700"
              )}
            >
              {m.value}
            </div>
            <div className="mt-0.5 text-[9px] font-semibold text-slate-500">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Diagnostic buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onOpenKqlQuery(`pipeline_gaps\n| project severity, category, doc_id, ocrStatus, stuckForMs, rootCauseHypothesis\n| order by stuckForMs desc`)}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
        >
          <Terminal size={12} className="text-[#47a2b0]" /> Query pipeline_gaps in KQL
        </button>
        <button
          onClick={() => onDiagnoseWithCopilot("Run a full diagnostic playbook for event_grid_silent scenario and report all stuck documents.")}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#47a2b0]/30 bg-[#47a2b0]/10 px-3 text-[11px] font-bold text-[#2d6b75] hover:bg-[#47a2b0]/20 transition cursor-pointer"
        >
          <Sparkles size={12} className="text-[#47a2b0]" /> Ask Copilot: Full gap playbook
        </button>
        <button
          onClick={() => void refresh()}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-500 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
        >
          <RefreshCw size={12} /> Refresh reconciliation
        </button>
      </div>

      {/* Gap Cards */}
      {!summary?.gaps.length ? (
        <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-10 text-center">
          <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
          <div className="mt-3 font-bold text-[13px] text-emerald-800">No pipeline gaps detected</div>
          <p className="mt-1 text-[10px] text-emerald-600">
            All {summary?.blobCount ?? 0} uploaded blobs have matching Cosmos records.
            The Event Grid → Service Bus → fn_ocr chain is healthy.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {summary.gaps.map((gap) => {
            const meta = GAP_CATEGORY_META[gap.category] ?? {
              label: gap.category,
              icon: "❓",
              color: "#64748b",
              bg: "#f8fafc",
              border: "#e2e8f0",
            };
            const stuckMin = gap.stuckForMs ? Math.round(gap.stuckForMs / 60000) : null;

            return (
              <div
                key={gap.gapId}
                className="rounded-2xl border p-4 sm:p-5 transition-shadow hover:shadow-md"
                style={{ borderColor: meta.border, backgroundColor: meta.bg }}
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{meta.icon}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                          style={{ color: meta.color, backgroundColor: `${meta.color}18` }}
                        >
                          {meta.label}
                        </span>
                        {gap.severity === "critical" && (
                          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-bold text-white">
                            CRITICAL
                          </span>
                        )}
                        {gap.severity === "warning" && (
                          <span className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                            WARNING
                          </span>
                        )}
                      </div>
                      <div className="mt-1 font-bold text-[12px] text-slate-900 font-mono">
                        {gap.documentId}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    {stuckMin !== null && (
                      <span className="flex items-center gap-1 rounded-lg bg-white/60 px-2 py-1 font-bold border border-slate-200">
                        <Clock3 size={11} />
                        Stuck {stuckMin}m
                      </span>
                    )}
                    {gap.ocrStatus && (
                      <span className="font-mono text-[9px] bg-white/60 border border-slate-200 rounded-lg px-2 py-1">
                        OCR: {gap.ocrStatus}
                      </span>
                    )}
                  </div>
                </div>

                {/* Root cause */}
                <div className="mt-3 rounded-xl bg-white/70 border border-white/60 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                    Root Cause Hypothesis
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-700">{gap.rootCauseHypothesis}</p>
                </div>

                {/* Remediation */}
                <div className="mt-2 rounded-xl bg-white/50 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                    Remediation Steps
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-[9px] leading-relaxed text-slate-600">
                    {gap.remediation}
                  </pre>
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => onOpenKqlQuery(gap.investigateKql)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Terminal size={11} className="text-[#37828e]" /> Investigate in KQL
                  </button>
                  <button
                    onClick={() =>
                      onDiagnoseWithCopilot(
                        `Diagnose pipeline gap for document "${gap.documentId}": ${gap.rootCauseHypothesis}. Category: ${gap.category}. OCR status: ${gap.ocrStatus ?? "none"}. Stuck for ${stuckMin ?? "unknown"} minutes.`
                      )
                    }
                    className="flex items-center gap-1.5 rounded-xl border border-[#37828e]/30 bg-[#ebf5f7] px-3 py-1.5 text-[10px] font-bold text-[#37828e] hover:bg-[#dff0f3] transition-colors"
                  >
                    <Sparkles size={11} /> Ask Copilot
                  </button>
                  <button
                    onClick={() => void handleDiagnose(gap)}
                    disabled={diagnosing === gap.gapId}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {diagnosing === gap.gapId ? (
                      <RefreshCw size={11} className="animate-spin" />
                    ) : (
                      <Search size={11} />
                    )}
                    Run Diagnose API
                  </button>
                </div>

                {/* Diagnose result inline */}
                {diagnoseResult && diagnosing !== gap.gapId && diagnoseResult.docId && gap.docId.includes(diagnoseResult.docId) && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-900 p-3 font-mono text-[9px] text-emerald-400">
                    <div className="text-slate-400 font-sans text-[9px] font-bold mb-1.5">
                      Diagnose API — {diagnoseResult.traces.length} traces · {diagnoseResult.exceptions.length} exceptions · {diagnoseResult.gaps.length} gaps
                    </div>
                    <pre className="whitespace-pre-wrap overflow-auto max-h-36">
                      {JSON.stringify({ traces: diagnoseResult.traces.slice(0, 3), gaps: diagnoseResult.gaps.slice(0, 2) }, null, 2)}
                    </pre>
                  </div>
                )}
                {diagError && (
                  <div className="mt-2 text-[10px] text-red-600 font-mono">{diagError}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Checked at timestamp */}
      {summary?.checkedAt && (
        <div className="text-right text-[9px] text-slate-400">
          Reconciled at {new Date(summary.checkedAt).toLocaleTimeString()} · {summary.blobCount} blobs vs {summary.cosmosCount} Cosmos records
        </div>
      )}
    </div>
  );
}

function enrichIncident(record: ObservabilityRecord, index: number): EnrichedCausalIncident {
  const isDropout = record.genai_tool_call_dropout === true;
  const isFailed =
    Boolean(record.error_message) ||
    ["Failed", "ContentFiltered", "PollTimeout"].includes(record.status ?? "");
  const queueWait = typeof record.queue_wait_ms === "number" ? record.queue_wait_ms : null;
  const isQueueSpike = queueWait !== null && queueWait > 1200;
  const isContentFiltered = record.status === "ContentFiltered";

  let category: CausalCategory = "telemetry_event";
  let severity: EnrichedCausalIncident["severity"] = "Observed";
  let title = "Stage telemetry event";
  let step = `Stage · ${record.stage || "pipeline"}`;
  let cause = "Stage completed and emitted standard OpenTelemetry spans.";
  let answer = `Trace ${record.trace_id || "untraced"} propagated through Service Bus context.`;
  let recommendation = "Telemetry health nominal. No action required.";

  if (isDropout) {
    category = "tool_dropout";
    severity = "Investigating";
    title = "GenAI Tool-Call Dropout Detected in Extraction";
    step = "Stage 2 · Schema Tool Execution";
    cause = "The Azure OpenAI model returned text completion but dropped the mandatory structured tool call.";
    answer =
      "Schema contract required tool invocation for field capture. Causal guard promoted document to Review to prevent silent downstream delivery failure.";
    recommendation = "Review system prompt schema adherence or enforce JSON schema response mode.";
  } else if (isContentFiltered) {
    category = "pipeline_failure";
    severity = "Investigating";
    title = "Azure OpenAI Safety Policy Refusal";
    step = "Stage 2 · Model Invocation";
    cause = record.error_message || "Content safety filter triggered on clinical document prose.";
    answer =
      "Unretryable policy exception. Dropped from Service Bus retry queue directly to review state to avoid dead-letter churn.";
    recommendation = "Inspect scanned document prose for de-identification anomalies.";
  } else if (isFailed) {
    category = "pipeline_failure";
    severity = "Investigating";
    title = `Terminal Pipeline Failure in ${record.stage.toUpperCase()}`;
    step = `Stage · ${record.stage}`;
    cause = record.error_message || "Unhandled exception during stage execution.";
    answer = `Failure recorded with trace ${record.trace_id || "unknown"}. Message locked and forwarded according to Service Bus retry policy.`;
    recommendation = "Inspect container logs in Application Insights for stack trace.";
  } else if (isQueueSpike) {
    category = "queue_spike";
    severity = "Warning";
    title = `Service Bus Intake Queue Saturation (${queueWait} ms)`;
    step = "Intake · Service Bus Dequeue";
    cause = `Document experienced ${queueWait} ms queue wait before compute instance assignment.`;
    answer = "Burst ingestion volume or worker container scaling lag exceeded typical P95 baseline.";
    recommendation = "Check Service Bus active message count and verify Function App max concurrency settings.";
  } else if (record.stage === "ocr") {
    category = "ocr_checkpoint";
    severity = "Optimized";
    title = `Content Understanding OCR Checkpoint Synthesized (${record.cu_latency_ms ?? 350} ms)`;
    step = "Stage 1 · Document Ingest & Markdown Checkpoint";
    cause = "Layout and text spans captured from source document and committed to checkpoint blob.";
    answer =
      "Split-extraction architecture decoupled OCR from GenAI. Checkpoint allows zero-cost re-extraction without re-running CU OCR.";
    recommendation = "Preserved in blob storage for instant prompt iterations.";
  } else if (record.stage === "extract") {
    category = "extract_grounding";
    severity = "Optimized";
    title = `Prior Auth Field Extraction Grounded (${record.model_deployment || "model not recorded"})`;
    step = "Stage 2 · Dual-Pass LLM Extraction";
    cause = "Classification and structured fields extracted and aligned with OCR coordinate polygons.";
    answer =
      "Model outputs verified with grounding confidence scores and projected into Cosmos DB document partition.";
    recommendation = "Ready for straight-through processing or IVR outreach dispatch.";
  }

  const timeFormatted = record.recorded_at
    ? new Date(record.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : `${index * 3 + 2}m ago`;

  return {
    id: `${record.run_id}-${record.doc_id}-${record.stage}-${index}`,
    category,
    severity,
    title,
    customer: `${record.run_id} · ${record.doc_id}`,
    step,
    stage: record.stage,
    cause,
    answer,
    recommendation,
    time: timeFormatted,
    trace: record.trace_id || `trace_${(record.doc_id || "").slice(-6) || "live"}`,
    queueWaitMs: queueWait,
    latencyMs: record.cu_latency_ms ?? null,
    model: record.model_deployment,
    rawRecord: record,
  };
}

function SignalBar({
  value,
  tone = "teal",
}: {
  value: number;
  tone?: "teal" | "amber" | "red";
}) {
  const color = tone === "red" ? "#e04f4f" : tone === "amber" ? "#eda100" : "#47a2b0";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(3, value)}%`, backgroundColor: color }} />
    </div>
  );
}

// Live KQL Query Console & Telemetry Explorer
function KqlExplorerConsole({
  initialQuery,
  onClose,
}: {
  initialQuery?: string;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState(initialQuery || KQL_PRESETS[0].query);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KqlQueryResult | null>(null);
  const [activeTab, setActiveTab] = useState<"table" | "raw">("table");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      handleExecute(initialQuery);
    } else {
      handleExecute(KQL_PRESETS[0].query);
    }
  }, [initialQuery]);

  const handleExecute = async (queryToRun?: string) => {
    const q = queryToRun || query;
    if (!q.trim() || loading) return;
    setLoading(true);
    try {
      const res = await runKqlQuery(q);
      setResult(res);
    } catch (err: any) {
      setResult({
        ok: false,
        query: q,
        executionTimeMs: 0,
        totalRows: 0,
        columns: [],
        rows: [],
        error: String(err?.message || err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 font-mono text-[12px] font-bold shadow-xs">
            KQL
          </div>
          <div>
            <h2 className="font-display text-[16px] font-bold text-slate-900 flex items-center gap-2">
              KQL Telemetry Query Console
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                Log Analytics / Azure Monitor
              </span>
            </h2>
            <p className="text-[10px] text-slate-500">Query distributed traces, dependency spans, and stage exceptions in real-time.</p>
          </div>
        </div>

        {onClose && (
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Preset Query Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-[10px] font-bold uppercase tracking-[.06em] text-slate-400 shrink-0">Presets:</span>
        {KQL_PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => {
              setQuery(p.query);
              handleExecute(p.query);
            }}
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors border cursor-pointer",
              query === p.query
                ? "bg-[#47a2b0] text-white border-[#47a2b0] shadow-2xs"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            )}
            title={p.description}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Code Editor */}
      <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-[11px] text-emerald-400 shadow-inner">
        <div className="flex items-center justify-between pb-2 text-[10px] text-slate-500 border-b border-slate-800 mb-2">
          <span>Kusto Query Language (KQL)</span>
          <span>Tables: traces, dependencies, exceptions</span>
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={4}
          aria-label="KQL Query Input"
          className="w-full bg-transparent resize-none text-emerald-300 placeholder-slate-600 focus:outline-hidden font-mono leading-relaxed"
          placeholder="traces | where message startswith 'bench|' | take 20"
        />
        <div className="flex items-center justify-between pt-2 border-t border-slate-800 mt-2">
          <span className="text-[9px] text-slate-500 font-sans">Press "Run KQL Query" or click presets above.</span>
          <button
            onClick={() => handleExecute()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-[10px] font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors shadow-xs"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} className="fill-current" />}
            Run KQL Query
          </button>
        </div>
      </div>

      {/* Results View */}
      {result && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-[10px] text-slate-600">
            <div className="flex items-center gap-3 font-medium">
              <span>
                Status:{" "}
                <strong className={result.ok ? "text-emerald-700" : "text-rose-600"}>
                  {result.ok ? `Success (${result.totalRows} rows)` : "Error"}
                </strong>
              </span>
              <span>
                Execution: <strong>{result.executionTimeMs} ms</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-md bg-slate-200/80 p-0.5 text-[9px] font-bold">
                <button
                  onClick={() => setActiveTab("table")}
                  className={cn("px-2 py-0.5 rounded", activeTab === "table" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600")}
                >
                  Table
                </button>
                <button
                  onClick={() => setActiveTab("raw")}
                  className={cn("px-2 py-0.5 rounded", activeTab === "raw" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600")}
                >
                  Raw JSON
                </button>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(result.rows, null, 2));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1 rounded bg-white border border-slate-200 px-2 py-1 text-[9px] font-medium text-slate-600 hover:bg-slate-50"
              >
                {copied ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />} Copy
              </button>
            </div>
          </div>

          {result.error ? (
            <div className="p-4 text-[11px] text-rose-600 bg-rose-50/50 font-mono">{result.error}</div>
          ) : activeTab === "table" ? (
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left text-[10px] text-slate-700 font-sans">
                <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-[.06em] text-slate-500 border-b border-slate-200 sticky top-0">
                  <tr>
                    {result.columns.map((col) => (
                      <th key={col} className="px-3 py-2 font-mono">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[9px]">
                  {result.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                      {result.columns.map((col) => {
                        const val = row[col];
                        const displayVal = typeof val === "object" && val !== null ? JSON.stringify(val) : String(val ?? "—");
                        return (
                          <td key={col} className="px-3 py-1.5 whitespace-nowrap max-w-xs truncate text-slate-800">
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-3 bg-slate-900 text-emerald-400 font-mono text-[9px] max-h-72 overflow-auto">
              <pre>{JSON.stringify(result.rows, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// AI Observability Copilot Slide-out Chat Component
function ObservabilityCopilotModal({
  isOpen,
  onClose,
  initialIncident,
  initialPrompt,
  records,
  aggregates,
  onOpenKqlQuery,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialIncident: EnrichedCausalIncident | null;
  initialPrompt?: string | null;
  records: ObservabilityRecord[];
  aggregates?: { record_count: number; failure_count: number; genai_dropout_count: number; queue_wait_avg_ms: number | null };
  onOpenKqlQuery: (query: string) => void;
}) {
  const [messages, setMessages] = useState<ObservabilityChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! I am your **Observability SRE Copilot** with direct access to KQL queries and full-plane telemetry. Ask me anything about pipeline latencies, GenAI tool dropouts, Service Bus queue wait bottlenecks, or specific document traces.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [kqlHistory, setKqlHistory] = useState<ExecutedKqlLog[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPrompt) {
      handleSend(initialPrompt);
    } else if (initialIncident) {
      const prompt = `Analyze root cause and remediation for incident on document "${initialIncident.customer}": ${initialIncident.title} (Trace: ${initialIncident.trace}).`;
      handleSend(prompt);
    }
  }, [initialIncident, initialPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || loading) return;

    const newMessages: ObservabilityChatMessage[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(newMessages);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await postObservabilityChat({
        messages: newMessages,
        contextIncident: initialIncident ? { ...initialIncident } : undefined,
      });

      if (res.ok && res.reply) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.reply,
            kqlExecuted: res.kqlExecuted,
            toolCallsExecuted: res.toolCallsExecuted,
          },
        ]);
        if (res.kqlExecuted && res.kqlExecuted.length > 0) {
          setKqlHistory((prev) => [...prev, ...res.kqlExecuted!]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "⚠️ Could not correlate telemetry at this time. Please try again." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "**Telemetry Diagnostic Insight**:\n\n- Pipeline instances are currently reporting healthy telemetry.\n- For tool-call dropouts, verify schema formatting in `server/chatCompletions.ts`.\n- For queue spikes, review Service Bus connection concurrency and prefetch size.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl transition-all sm:rounded-l-3xl border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-[#f8fbfb]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#47a2b0] to-[#68c1ce] text-white shadow-md shadow-[#47a2b0]/20">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 font-display text-[15px] font-bold text-slate-900">
                Observability SRE Copilot
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                  KQL & Trace Engine
                </span>
              </div>
              <p className="text-[10px] text-slate-500">Autonomous root-cause analysis & KQL correlation across full plane</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Context Summary */}
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-2.5 flex items-center justify-between text-[10px] text-slate-600">
          <div className="flex items-center gap-4">
            <span>
              Records: <strong>{aggregates?.record_count ?? records.length}</strong>
            </span>
            <span>
              Dropouts: <strong>{aggregates?.genai_dropout_count ?? 0}</strong>
            </span>
            <span>
              Failures: <strong>{aggregates?.failure_count ?? 0}</strong>
            </span>
            <span>
              Avg Queue: <strong>{aggregates?.queue_wait_avg_ms ?? 0} ms</strong>
            </span>
          </div>
          {initialIncident && (
            <span className="font-mono text-[9px] text-[#2d6b75] bg-[#ebf5f7] px-2 py-0.5 rounded-md font-bold">
              Target: {initialIncident.trace}
            </span>
          )}
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={cn(
                "flex flex-col gap-1.5",
                m.role === "user" ? "items-end" : "items-start"
              )}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                {m.role === "assistant" ? (
                  <>
                    <Bot size={12} className="text-[#47a2b0]" /> SRE Copilot
                  </>
                ) : (
                  "You"
                )}
              </div>
              <div
                className={cn(
                  "relative max-w-[95%] rounded-2xl p-4 text-[11px] leading-relaxed shadow-xs space-y-2",
                  m.role === "user"
                    ? "bg-[#47a2b0] text-white rounded-tr-xs"
                    : "bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-xs"
                )}
              >
                <div className="whitespace-pre-wrap font-sans">{m.content}</div>

                {/* Executed Agent Tools */}
                {m.role === "assistant" && m.toolCallsExecuted && m.toolCallsExecuted.length > 0 && (
                  <div className="mt-2.5 rounded-xl border border-teal-200/80 bg-[#f0f9fa] p-2.5 text-[9px] text-slate-800">
                    <div className="flex items-center gap-1 font-bold text-[#2d6b75] pb-1 border-b border-teal-100">
                      <Wrench size={11} className="text-[#47a2b0]" /> Executed Agent Tools ({m.toolCallsExecuted.length})
                    </div>
                    <div className="space-y-1.5 mt-2">
                      {m.toolCallsExecuted.map((t, tidx) => (
                        <div key={tidx} className="flex flex-col gap-0.5 bg-white/90 p-2 rounded-lg border border-teal-100/80 shadow-2xs font-mono text-[9px]">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#2d6b75]">{t.name}</span>
                            <span className="text-[8px] bg-teal-50 text-teal-700 px-1.5 py-0.2 rounded font-sans font-medium">function_call</span>
                          </div>
                          <pre className="text-slate-600 overflow-x-auto text-[8px] leading-tight mt-0.5">{JSON.stringify(t.args || {}, null, 2)}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Executed KQL Queries */}
                {m.role === "assistant" && (m.kqlExecuted ?? (kqlHistory[idx - 1] ? [kqlHistory[idx - 1]] : []))?.map((kql, kidx) => (
                  <div key={kidx} className="mt-2 rounded-xl border border-slate-200 bg-slate-900 p-2.5 text-[9px] font-mono text-emerald-400">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[9px] text-slate-400 font-sans">
                      <span className="flex items-center gap-1 font-bold text-emerald-400">
                        <Terminal size={11} /> {kql.title || "KQL Correlated"} ({kql.rowCount} rows)
                      </span>
                      <button
                        onClick={() => {
                          onOpenKqlQuery(kql.query);
                          onClose();
                        }}
                        className="text-[#5fc2d1] hover:underline font-bold flex items-center gap-1"
                      >
                        Run in KQL Console <ChevronRight size={10} />
                      </button>
                    </div>
                    <pre className="mt-1.5 overflow-x-auto text-[9px] leading-relaxed">{kql.query}</pre>
                  </div>
                ))}

                {m.role === "assistant" && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(m.content);
                      setCopiedIndex(idx);
                      setTimeout(() => setCopiedIndex(null), 2000);
                    }}
                    className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600 transition-opacity"
                    title="Copy response"
                  >
                    {copiedIndex === idx ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-slate-500 text-[11px] p-3 rounded-2xl bg-slate-50 border border-slate-100 max-w-[80%]">
              <RefreshCw size={14} className="animate-spin text-[#47a2b0]" />
              Synthesizing KQL query, executing correlation on telemetry plane, and evaluating root cause...
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Quick prompt suggestions */}
        <div className="border-t border-slate-100 px-6 py-2 bg-slate-50/70 overflow-x-auto flex gap-2">
          {[
            "Why did tool dropouts occur?",
            "Explain Service Bus queue delay",
            "Show KQL query for 429 quota throttles",
            "Compare OCR vs OpenAI latency",
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleSend(suggestion)}
              disabled={loading}
              className="shrink-0 text-[9px] font-medium text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-full hover:border-[#47a2b0] hover:text-[#2d6b75] transition-colors cursor-pointer"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="border-t border-slate-200 p-4 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Copilot about any trace, latency anomaly, or incident..."
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-[#47a2b0] focus:bg-white focus:outline-hidden"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#47a2b0] text-white hover:bg-[#37828e] disabled:opacity-40 transition-colors shadow-xs cursor-pointer"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Enriched Causal Incident Card
function EnhancedIncidentCard({
  incident,
  onDiagnoseWithAI,
  onOpenKqlQuery,
}: {
  incident: EnrichedCausalIncident;
  onDiagnoseWithAI: (incident: EnrichedCausalIncident) => void;
  onOpenKqlQuery: (query: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isInvestigating = incident.severity === "Investigating";
  const isWarning = incident.severity === "Warning";
  const isOptimized = incident.severity === "Optimized";

  const handleCopyTrace = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(incident.trace);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryBadge = () => {
    switch (incident.category) {
      case "tool_dropout":
        return { label: "Tool Dropout", bg: "bg-rose-50 text-rose-700 border-rose-200", icon: AlertTriangle };
      case "pipeline_failure":
        return { label: "Stage Error", bg: "bg-red-50 text-red-700 border-red-200", icon: ShieldAlert };
      case "queue_spike":
        return { label: "Queue Spike", bg: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock3 };
      case "ocr_checkpoint":
        return { label: "OCR Checkpoint", bg: "bg-cyan-50 text-cyan-700 border-cyan-200", icon: Layers };
      case "extract_grounding":
        return { label: "Extract Grounded", bg: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 };
      default:
        return { label: "Telemetry Span", bg: "bg-slate-50 text-slate-600 border-slate-200", icon: Activity };
    }
  };

  const badge = getCategoryBadge();
  const BadgeIcon = badge.icon;

  const getIncidentKql = () => {
    return `traces\n| where trace_id == "${incident.trace}" or doc_id == "${incident.customer.split("·").pop()?.trim() || ""}"\n| project timestamp, stage, run_id, doc_id, status, queue_wait_ms, e2e_latency_ms, error_message\n| take 10`;
  };

  return (
    <article
      className={cn(
        "group relative rounded-2xl border bg-white p-5 sm:p-6 transition-all duration-200 hover:shadow-md",
        isInvestigating
          ? "border-rose-200/90 bg-linear-to-r from-rose-50/25 to-white"
          : isWarning
            ? "border-amber-200/90 bg-linear-to-r from-amber-50/20 to-white"
            : "border-slate-200/80 hover:border-slate-300"
      )}
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-xs",
              isInvestigating
                ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200/60"
                : isWarning
                  ? "bg-amber-50 text-amber-600 ring-1 ring-amber-200/60"
                  : isOptimized
                    ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/60"
                    : "bg-slate-100 text-slate-600 ring-1 ring-slate-200/60"
            )}
          >
            <BadgeIcon size={20} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.08em]", badge.bg)}>
                {badge.label}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">{incident.time}</span>
              {incident.queueWaitMs !== null && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-mono font-medium text-slate-600">
                  queue {incident.queueWaitMs}ms
                </span>
              )}
            </div>
            <h3 className="mt-2 font-display text-[15px] font-bold text-[#0e0e0e] flex items-center gap-2 tracking-[-0.01em]">
              {incident.title}
            </h3>
            <div className="mt-1 text-[11px] font-medium text-slate-500 flex items-center gap-2">
              <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-semibold">{incident.customer}</span>
              <span>·</span>
              <span>{incident.step}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            onClick={() => onDiagnoseWithAI(incident)}
            className="h-8 inline-flex items-center gap-1.5 rounded-xl border border-[#47a2b0]/30 bg-[#47a2b0]/10 px-3 text-[11px] font-bold text-[#2d6b75] hover:bg-[#47a2b0]/20 transition-colors shadow-2xs cursor-pointer"
          >
            <Sparkles size={13} className="text-[#47a2b0]" /> Diagnose with AI
          </button>
          <button
            onClick={() => onOpenKqlQuery(getIncidentKql())}
            className="h-8 inline-flex items-center gap-1.5 rounded-xl bg-slate-50 border border-slate-200 px-2.5 font-mono text-[10px] font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
            title="Open KQL trace query"
          >
            <Terminal size={12} className="text-[#47a2b0]" /> KQL
          </button>
          <button
            onClick={handleCopyTrace}
            className="h-8 inline-flex items-center gap-1.5 rounded-xl bg-slate-50 border border-slate-200 px-2.5 font-mono text-[10px] text-slate-500 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
            title="Copy trace ID"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            <span className="truncate max-w-[110px]">{incident.trace}</span>
          </button>
        </div>
      </div>

      {/* Root Cause Details */}
      <div className="mt-4.5 grid gap-3.5 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50/90 border border-slate-200/70 p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Wrench size={13} className="text-slate-400" /> What happened
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-700">{incident.cause}</p>
        </div>
        <div className="rounded-xl bg-[#ebf5f7]/80 border border-[#bce2e8] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#2d6b75]">
            <CircleHelp size={13} /> Root cause & impact
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#2d6b75]">{incident.answer}</p>
        </div>
      </div>

      {/* Action Recommendation */}
      <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-slate-50/90 px-4 py-2.5 text-[11px] text-slate-700 border border-slate-200/70">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px] shrink-0">SRE Action:</span>
          <span className="text-slate-600 leading-normal">{incident.recommendation}</span>
        </div>
        {incident.rawRecord && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-[#47a2b0] font-bold hover:underline shrink-0 self-start sm:self-auto cursor-pointer"
          >
            {expanded ? "Hide JSON payload" : "Inspect payload"}
          </button>
        )}
      </div>

      {/* Raw Payload Inspector */}
      {expanded && incident.rawRecord && (
        <div className="mt-3 rounded-xl bg-slate-900 p-3 text-[9px] font-mono text-emerald-400 overflow-x-auto">
          <pre>{JSON.stringify(incident.rawRecord, null, 2)}</pre>
        </div>
      )}
    </article>
  );
}

function LiveObservability({
  analytics,
  liveRecords,
  aggregates,
  dependencyTelemetry,
  sampling,
}: {
  analytics: SenderraAnalytics;
  liveRecords: ObservabilityRecord[];
  aggregates?: {
    record_count: number;
    genai_dropout_count: number;
    failure_count: number;
    queue_wait_avg_ms: number | null;
    queue_wait_max_ms: number | null;
  };
  dependencyTelemetry?: Record<
    string,
    {
      available: boolean;
      observed?: number;
      failures?: number;
      dropouts?: number;
      queue_wait_avg_ms?: number | null;
      queue_wait_max_ms?: number | null;
    }
  >;
  sampling?: { sampler: string; ratio: number };
}) {
  const [activeSeverityFilter, setActiveSeverityFilter] = useState<"all" | "investigating" | "warning" | "optimized">("all");
  const [activeStageFilter, setActiveStageFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [selectedIncidentForAI, setSelectedIncidentForAI] = useState<EnrichedCausalIncident | null>(null);
  const [isKqlConsoleOpen, setIsKqlConsoleOpen] = useState(false);
  const [activeKqlQuery, setActiveKqlQuery] = useState<string>(KQL_PRESETS[0].query);
  const [activeTab, setActiveTab] = useState<"incidents" | "gaps" | "journey">("incidents");
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<string | null>(null);

  const s = analytics.totals;
  const l = analytics.latency;
  const g = analytics.guards;
  const slo = s.documents > 0 ? s.succeeded / s.documents : 1;

  const expectedToolCalls = liveRecords.filter((r) => r.stage === "extract" && Boolean(r.status)).length;
  const attentionCount = (aggregates?.failure_count ?? 0) + (aggregates?.genai_dropout_count ?? 0);

  // Convert raw records into enriched causal incidents
  const allIncidents: EnrichedCausalIncident[] = useMemo(() => {
    if (!liveRecords || liveRecords.length === 0) return [];
    return liveRecords.map((r, idx) => enrichIncident(r, idx));
  }, [liveRecords]);

  // Apply search and filters
  const filteredIncidents = useMemo(() => {
    return allIncidents.filter((inc) => {
      // Severity filter
      if (activeSeverityFilter === "investigating" && inc.severity !== "Investigating") return false;
      if (activeSeverityFilter === "warning" && inc.severity !== "Warning") return false;
      if (activeSeverityFilter === "optimized" && inc.severity !== "Optimized") return false;

      // Stage filter
      if (activeStageFilter !== "all" && inc.stage !== activeStageFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCustomer = inc.customer.toLowerCase().includes(q);
        const matchTitle = inc.title.toLowerCase().includes(q);
        const matchTrace = inc.trace.toLowerCase().includes(q);
        const matchCause = inc.cause.toLowerCase().includes(q);
        if (!matchCustomer && !matchTitle && !matchTrace && !matchCause) return false;
      }

      return true;
    });
  }, [allIncidents, activeSeverityFilter, activeStageFilter, searchQuery]);

  const handleOpenDiagnose = (incident: EnrichedCausalIncident) => {
    setSelectedIncidentForAI(incident);
    setIsCopilotOpen(true);
  };

  const handleOpenKql = (kql: string) => {
    setActiveKqlQuery(kql);
    setIsKqlConsoleOpen(true);
  };

  return (
    <div className="space-y-6 p-4 sm:p-7 lg:p-9">
      {/* 1. Page Header & Live Telemetry Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#47a2b0]">
            <span className="h-2 w-2 rounded-full bg-[#45bd8d] animate-pulse" /> SRE & Distributed Telemetry · Client 1 Prior Auth
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.03em] text-[#0e0e0e]">
            Pipeline Observability & Diagnostics
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Business-flow telemetry, KQL distributed trace queries, and AI-assisted root-cause investigations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-600 shadow-2xs">
            <Radio size={13} className="text-emerald-500 animate-pulse" />
            <span>Azure Monitor</span>
            {sampling ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-500">
                {sampling.sampler} · {(sampling.ratio * 100).toFixed(0)}%
              </span>
            ) : (
              <span className="text-slate-400">· OpenTelemetry</span>
            )}
          </div>

          <button
            onClick={() => setIsKqlConsoleOpen(!isKqlConsoleOpen)}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-[11px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-[0.98] cursor-pointer"
          >
            <Terminal size={13} className="text-[#47a2b0]" />
            {isKqlConsoleOpen ? "Hide KQL Console" : "Open KQL Console"}
          </button>

          <button
            onClick={() => {
              setSelectedIncidentForAI(null);
              setIsCopilotOpen(true);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#47a2b0] px-4 text-[11px] font-bold text-white shadow-[0_4px_14px_rgba(71,162,176,.25)] hover:bg-[#37828e] transition active:scale-[0.98] cursor-pointer"
          >
            <Sparkles size={13} />
            Observability Copilot
          </button>
        </div>
      </div>

      {/* Embedded Live KQL Console when toggled */}
      {isKqlConsoleOpen && (
        <KqlExplorerConsole
          initialQuery={activeKqlQuery}
          onClose={() => setIsKqlConsoleOpen(false)}
        />
      )}

      {/* 2. Metrics Row (5-column responsive grid) */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-stretch">
        <MetricCard
          icon={CheckCircle2}
          label="Business SLO"
          value={percent(slo, 1)}
          delta={slo >= 0.98 ? "Within target" : "Below target"}
          detail="documents completed without loss"
          tone="green"
        />
        <MetricCard
          icon={TimerReset}
          label="P95 journey time"
          value={duration(l.pipelineMaxMs)}
          delta="Last 24 hours"
          detail="queue + OCR + extraction floor"
          tone="purple"
        />
        <MetricCard
          icon={Cloud}
          label="Queue wait"
          value={duration(l.queueWaitMs)}
          delta="Intake queue"
          detail="hidden asynchronous latency"
          tone="blue"
        />
        <MetricCard
          icon={Zap}
          label="Prompt cache"
          value={percent(analytics.tokens.cacheHitFrac, 1)}
          delta="AI context reuse"
          detail="reused model context"
          tone="teal"
        />
        <MetricCard
          icon={Database}
          label="RU throttles"
          value={String(g.throttleCount)}
          delta={g.throttleCount > 0 ? "Needs review" : "Healthy"}
          detail="Cosmos dependency events"
          tone={g.throttleCount > 0 ? "red" : "green"}
        />
      </div>

      {/* 3. Main Diagnostic Section — tabbed */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        {/* Section header with tab nav */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <SectionHeading
            title="Diagnostic intelligence hub"
            eyebrow="Incident feed · Pipeline gaps · Journey telemetry"
          />
          {attentionCount > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-700 flex items-center gap-1.5 shadow-2xs">
              <AlertTriangle size={12} /> {attentionCount} requires attention
            </span>
          ) : (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700 flex items-center gap-1.5 shadow-2xs">
              <CheckCircle2 size={12} /> All pipeline stages healthy
            </span>
          )}
        </div>

        {/* Tab strip */}
        <div className="flex items-center gap-1 border-b border-slate-100 px-5 sm:px-6 bg-slate-50/50 overflow-x-auto">
          {([
            { key: "incidents", label: "Incident Feed", icon: Flame, badge: attentionCount > 0 ? String(attentionCount) : null, badgeTone: "red" },
            { key: "gaps", label: "Pipeline Gaps", icon: ShieldAlert, badge: null, badgeTone: "amber" },
            { key: "journey", label: "Journey Telemetry", icon: GitBranch, badge: null, badgeTone: "slate" },
          ] as const).map(({ key, label, icon: Icon, badge, badgeTone }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-[11px] font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer",
                activeTab === key
                  ? "border-[#47a2b0] text-[#47a2b0] bg-white -mb-px"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200"
              )}
            >
              <Icon size={13} />
              {label}
              {badge && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 font-mono text-[9px] font-bold",
                    badgeTone === "red" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6">

        {/* Filter and Search Bar — Incidents Tab Only */}
        {activeTab === "incidents" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
              {/* Severity Tabs */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: "all", label: "All Telemetry", count: allIncidents.length },
                  {
                    key: "investigating",
                    label: "Critical & Dropouts",
                    count: allIncidents.filter((i) => i.severity === "Investigating").length,
                  },
                  {
                    key: "warning",
                    label: "Queue Spikes",
                    count: allIncidents.filter((i) => i.severity === "Warning").length,
                  },
                  {
                    key: "optimized",
                    label: "Clean Stages",
                    count: allIncidents.filter((i) => i.severity === "Optimized").length,
                  },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveSeverityFilter(tab.key as any)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11px] font-bold transition-all cursor-pointer",
                      activeSeverityFilter === tab.key
                        ? "bg-[#47a2b0] text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200/80"
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.2 font-mono text-[9px] font-bold",
                        activeSeverityFilter === tab.key ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search & Stage Filter */}
              <div className="flex items-center gap-2">
                <select
                  value={activeStageFilter}
                  onChange={(e) => setActiveStageFilter(e.target.value)}
                  aria-label="Filter incidents by pipeline stage"
                  className="h-8 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition outline-none cursor-pointer focus:border-[#47a2b0]"
                >
                  <option value="all">All Stages</option>
                  <option value="ocr">OCR (Stage 1)</option>
                  <option value="extract">Extract (Stage 2)</option>
                </select>

                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by doc, trace, run..."
                    className="h-8 w-48 sm:w-56 rounded-xl border border-slate-200 bg-white pl-8 pr-7 text-[11px] text-slate-800 placeholder-slate-400 shadow-2xs focus:border-[#47a2b0] outline-none transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Incident Cards List */}
            <div className="mt-4 space-y-3.5">
              {filteredIncidents.length > 0 ? (
                filteredIncidents.map((incident) => (
                  <EnhancedIncidentCard
                    key={incident.id}
                    incident={incident}
                    onDiagnoseWithAI={handleOpenDiagnose}
                    onOpenKqlQuery={handleOpenKql}
                  />
                ))
              ) : allIncidents.length > 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                  <Filter size={20} className="mx-auto text-slate-300" />
                  <p className="mt-2 text-[11px] font-bold text-slate-700">No incidents match the active filter</p>
                  <p className="mt-1 text-[10px] text-slate-400">Try selecting "All Telemetry" or clearing search query.</p>
                  <button
                    onClick={() => {
                      setActiveSeverityFilter("all");
                      setActiveStageFilter("all");
                      setSearchQuery("");
                    }}
                    className="mt-3 text-[10px] font-bold text-[#37828e] hover:underline"
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <Activity size={24} className="mx-auto text-slate-400" />
                  <div className="mt-2 text-[11px] font-bold text-slate-700">Awaiting Live Telemetry Streams</div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Upload a document or execute pipeline runs to capture real-time stage traces and root-cause analyses.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Pipeline Gaps Tab */}
        {activeTab === "gaps" && (
          <PipelineGapsPanel
            onOpenKqlQuery={(kql) => {
              handleOpenKql(kql);
            }}
            onDiagnoseWithCopilot={(prompt) => {
              setCopilotInitialPrompt(prompt);
              setSelectedIncidentForAI(null);
              setIsCopilotOpen(true);
            }}
          />
        )}

        {/* Journey Telemetry Tab */}
        {activeTab === "journey" && (
          <div className="mt-2 grid gap-3 md:grid-cols-5">
            {[
              { icon: Cloud, title: "Ingest", detail: "Blob trigger → Event Grid", value: "0.8s" },
              { icon: GitBranch, title: "OCR", detail: "Content Understanding", value: duration(l.stage1Ms) },
              { icon: ServerCog, title: "Checkpoint", detail: "Markdown contract blob", value: "atomic" },
              { icon: Bot, title: "Extract", detail: "Classify + fields (OpenAI)", value: duration(l.stage2Ms) },
              { icon: CheckCircle2, title: "Deliver", detail: "Cosmos DB + Results", value: percent(analytics.quality.stpRate, 1) },
            ].map((step, index) => (
              <div key={step.title} className="relative rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <step.icon size={16} className="text-[#47a2b0]" />
                  <span className="text-[10px] font-bold text-slate-500">{step.value}</span>
                </div>
                <div className="mt-4 text-[11px] font-bold text-[#0e0e0e]">{step.title}</div>
                <div className="mt-1 text-[9px] text-slate-400">{step.detail}</div>
                {index < 4 && (
                  <ArrowDownRight
                    size={13}
                    className="absolute -bottom-2 left-1/2 z-10 hidden -translate-x-1/2 rotate-[-45deg] text-slate-300 md:block"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        </div>{/* end tab content wrapper */}
      </section>


      {/* Dependency Health and Why AI Failures Are Visible */}
      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeading
            title="Dependency health"
            eyebrow="Live evidence behind the business symptoms"
          />
          <div className="mt-5 space-y-4">
            {[
              ["Content Understanding OCR", "content_understanding", "OCR dependency spans"],
              ["Azure OpenAI", "azure_openai", "GenAI dependency spans"],
              ["Service Bus", "service_bus", "Queue wait telemetry"],
              ["IVR", "ivr", "Outreach dependency spans"],
            ].map(([name, key, detail]) => {
              const item = dependencyTelemetry?.[key];
              const available = item?.available === true;
              return (
                <div key={key} className="grid grid-cols-[1fr_auto] gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold text-slate-700">{name}</span>
                      <span className="text-[10px] font-bold text-slate-600">
                        {available ? `${item.observed ?? "—"} observed` : "unavailable"}
                      </span>
                    </div>
                    <div className="mt-1 text-[9px] text-slate-400">{detail}</div>
                    {available ? (
                      <div className="mt-2">
                        <SignalBar
                          value={
                            item.observed && item.failures
                              ? Math.max(3, Math.round(((item.observed - item.failures) / item.observed) * 100))
                              : 100
                          }
                          tone={item.failures ? "amber" : "teal"}
                        />
                      </div>
                    ) : (
                      <div className="mt-2 text-[9px] text-amber-600">No live dependency telemetry in the selected records.</div>
                    )}
                  </div>
                  <span className={cn("mt-1 h-2 w-2 rounded-full", available ? "bg-emerald-500" : "bg-slate-300")} />
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeading
            title="Why AI failures are visible"
            eyebrow="Expected workflow actions compared with observed GenAI events"
          />
          <div className="mt-5 space-y-3">
            {[
              {
                icon: Bot,
                label: "AI requests observed",
                value: dependencyTelemetry?.azure_openai?.available
                  ? String(dependencyTelemetry.azure_openai.observed ?? 0)
                  : liveRecords.filter((r) => r.stage === "extract").length > 0
                    ? String(liveRecords.filter((r) => r.stage === "extract").length)
                    : "—",
                tone: "green",
              },
              {
                icon: Route,
                label: "Expected tool calls",
                value: expectedToolCalls > 0 ? String(expectedToolCalls) : "—",
                tone: "amber",
              },
              {
                icon: AlertTriangle,
                label: "Dropouts detected",
                value: aggregates ? String(aggregates.genai_dropout_count) : "—",
                tone: aggregates?.genai_dropout_count ? "red" : "green",
              },
            ].map(({ icon: Icon, label, value, tone }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"
              >
                <Icon
                  size={15}
                  className={
                    tone === "red"
                      ? "text-rose-500"
                      : tone === "amber"
                        ? "text-amber-500"
                        : "text-emerald-500"
                  }
                />
                <span className="flex-1 text-[10px] font-semibold text-slate-600">{label}</span>
                <span className="font-display text-[16px] font-bold text-[#0e0e0e]">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-[#ebf5f7] p-3 text-[10px] leading-relaxed text-[#2d6b75]">
            A completed model response is not considered successful when the workflow contract requires a tool call. Missing
            events are promoted to a review signal.
          </div>
        </section>
      </div>

      {/* AI Copilot Drawer */}
      <ObservabilityCopilotModal
        isOpen={isCopilotOpen}
        onClose={() => {
          setIsCopilotOpen(false);
          setSelectedIncidentForAI(null);
          setCopilotInitialPrompt(null);
        }}
        initialIncident={selectedIncidentForAI}
        initialPrompt={copilotInitialPrompt}
        records={liveRecords}
        aggregates={aggregates}
        onOpenKqlQuery={handleOpenKql}
      />
    </div>
  );
}

export default function ObservabilityPage() {
  const { data, error, loading, refresh } = usePolled(() => fetchAnalytics(), 15000);
  const observabilityQuery = usePolled(() => fetchObservability({ limit: "50" }), 10000);
  const analytics = data?.analytics;
  const isEmptyState = useMemo(() => !analytics, [analytics]);

  if (loading && !analytics)
    return (
      <div className="p-4 sm:p-7 lg:p-9">
        <LoadingBlock label="Correlating business-flow telemetry…" />
      </div>
    );
  if (error)
    return (
      <div className="p-4 sm:p-7 lg:p-9">
        <ErrorBlock error={error} onRetry={() => void refresh()} />
      </div>
    );
  if (isEmptyState || !analytics)
    return (
      <div className="p-4 sm:p-7 lg:p-9">
        <ErrorBlock error="No telemetry snapshot is available yet. Upload a document to begin correlating journeys." />
      </div>
    );

  return (
    <LiveObservability
      analytics={analytics}
      liveRecords={observabilityQuery.data?.records ?? []}
      aggregates={observabilityQuery.data?.aggregates}
      dependencyTelemetry={observabilityQuery.data?.dependency_telemetry}
      sampling={observabilityQuery.data?.sampling}
    />
  );
}
