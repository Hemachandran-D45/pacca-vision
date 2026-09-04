import { ArrowRight, Boxes, Coins, FileText, Gauge, UserRound, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  STATUS_COLOR,
  STATUS_INK,
  duration,
  fetchDocuments,
  fetchStats,
  humanize,
  percent,
  relativeTime,
  usd,
  usePolled,
  type DocumentSummary,
} from "./api";
import { ConfidenceBar, ErrorBlock, LiveBadge, LoadingBlock, StatusPill } from "./parts";

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div
        className={
          tone === "warn"
            ? "flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"
            : "flex h-9 w-9 items-center justify-center rounded-xl bg-[#ebf5f7] text-[#47a2b0]"
        }
      >
        <Icon size={17} />
      </div>
      <div className="mt-5 text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</div>
      <div className="mt-1.5 font-display text-[26px] font-bold tabular-nums leading-none tracking-[-.05em] text-[#0e0e0e]">
        {value}
      </div>
      <div className="mt-2.5 text-[10px] leading-relaxed text-slate-400">{hint}</div>
    </div>
  );
}

/**
 * Documents by type.
 *
 * A single series measuring magnitude across a handful of named categories, so
 * this is a plain sorted bar in one hue — not a categorical palette. The type
 * name is the identity; colour carries no meaning here and cycling seven hues
 * through it would invent a distinction the data does not have. Values are
 * labelled directly, so there is no axis to read against.
 */
function DocumentsByType({ rows }: { rows: { docType: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="font-display text-[13px] font-bold tracking-[-.03em] text-[#0e0e0e]">
        Documents by type
      </h3>
      <p className="mt-1 text-[10px] text-slate-400">Classified by the pipeline's first model call.</p>
      <div className="mt-4 space-y-2.5">
        {rows.map((row) => (
          <div key={row.docType} className="flex items-center gap-3">
            <div className="w-[130px] shrink-0 truncate text-[10px] font-semibold text-slate-600">
              {humanize(row.docType)}
            </div>
            <div className="h-3 flex-1 overflow-hidden rounded-r-[4px] bg-slate-50">
              <div
                className="h-full rounded-r-[4px] bg-[#47a2b0] transition-[width] duration-500"
                style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }}
              />
            </div>
            <div className="w-6 shrink-0 text-right tabular-nums text-[11px] font-bold text-[#0e0e0e]">
              {row.count}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-[11px] text-slate-400">Nothing classified yet.</p>}
      </div>
    </div>
  );
}

/**
 * Pipeline state.
 *
 * Deliberately a labelled list rather than a stacked bar or donut. The seven
 * status colours are a reserved semantic set, not a categorical palette, and
 * two adjacent pairs fail CVD separation when rendered as touching segments —
 * a labelled row keeps the name as the identity and the colour as reinforcement.
 */
function PipelineState({ rows, total }: { rows: { status: string; count: number }[]; total: number }) {
  const ordered = [...rows].sort((a, b) => b.count - a.count);
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="font-display text-[13px] font-bold tracking-[-.03em] text-[#0e0e0e]">
        Pipeline state
      </h3>
      <p className="mt-1 text-[10px] text-slate-400">Where the corpus is sitting right now.</p>
      <div className="mt-4 space-y-2">
        {ordered.map((row) => {
          const key = row.status as DocumentSummary["uiStatus"];
          const fill = STATUS_COLOR[key] ?? "#8496ad";
          const ink = STATUS_INK[key] ?? "#495a70";
          return (
            <div key={row.status} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: fill }} />
              <span className="flex-1 text-[11px] font-semibold" style={{ color: ink }}>
                {row.status}
              </span>
              <span className="tabular-nums text-[11px] font-bold text-[#0e0e0e]">{row.count}</span>
              <span className="w-10 text-right tabular-nums text-[10px] text-slate-400">
                {total > 0 ? `${Math.round((row.count / total) * 100)}%` : "—"}
              </span>
            </div>
          );
        })}
        {ordered.length === 0 && <p className="text-[11px] text-slate-400">No documents yet.</p>}
      </div>
    </div>
  );
}

export function CommandCenterLive({
  onNavigate,
  onOpenDocument,
}: {
  onNavigate: (path: string) => void;
  onOpenDocument: (documentId: string) => void;
}) {
  const statsQuery = usePolled(() => fetchStats(), 10000);
  const docsQuery = usePolled(() => fetchDocuments({ limit: "8" }), 10000);

  const stats = statsQuery.data?.stats;
  const recent = docsQuery.data?.documents ?? [];

  if (statsQuery.loading && !stats) return <div className="p-4 sm:p-7 lg:p-9"><LoadingBlock /></div>;

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#47a2b0]">
              Client 1 · Prior Auth Processing
            </div>
            <LiveBadge />
          </div>
          <h1 className="mt-2 font-display text-[26px] font-bold tracking-[-.05em] text-[#0e0e0e]">
            Command Center
          </h1>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Every number on this page is read from the Senderra IDP pipeline's Cosmos projection.
          </p>
        </div>
        <button
          onClick={() => onNavigate("/documents")}
          className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white shadow-[0_8px_18px_rgba(71,162,176,.2)] hover:bg-[#37828e]"
        >
          Open documents <ArrowRight size={13} />
        </button>
      </div>

      {statsQuery.error && <ErrorBlock error={statsQuery.error} onRetry={() => void statsQuery.refresh()} />}

      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              icon={FileText}
              label="Documents"
              value={String(stats.documents)}
              hint={`${stats.processed} finished extraction`}
            />
            <Metric
              icon={UserRound}
              label="Awaiting review"
              value={String(stats.pendingReview)}
              hint={`${stats.reviewed} resolved by a reviewer`}
              tone={stats.pendingReview > 0 ? "warn" : "default"}
            />
            <Metric
              icon={Zap}
              label="Straight through"
              value={percent(stats.stpRate, 1)}
              hint={`${stats.stpCount} tripped no review gate`}
            />
            <Metric
              icon={Gauge}
              label="Mean field score"
              value={percent(stats.avgFieldScore, 1)}
              hint={`OCR ${percent(stats.avgOcrConfidence, 1)} · min across gates`}
            />
            <Metric
              icon={Coins}
              label="Spend"
              value={usd(stats.totalCostUsd, 2)}
              hint={`${stats.pagesBilled} pages billed · CU + model`}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <DocumentsByType rows={stats.byDocType} />
            <PipelineState rows={stats.byStatus} total={stats.documents} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ebf5f7] text-[#47a2b0]">
                <Boxes size={17} />
              </div>
              <div className="mt-4 text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">
                Prompt cache
              </div>
              <div className="mt-1.5 font-display text-[22px] font-bold tabular-nums tracking-[-.05em] text-[#0e0e0e]">
                {percent(stats.avgCacheHit, 1)}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                Share of prompt tokens served from cache. This is the single largest lever on model spend.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ebf5f7] text-[#47a2b0]">
                <Gauge size={17} />
              </div>
              <div className="mt-4 text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">
                Mean end-to-end
              </div>
              <div className="mt-1.5 font-display text-[22px] font-bold tabular-nums tracking-[-.05em] text-[#0e0e0e]">
                {duration(stats.avgLatencyMs)}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                Intake to final metadata, measured per document by the pipeline itself.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ebf5f7] text-[#47a2b0]">
                <Coins size={17} />
              </div>
              <div className="mt-4 text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">
                Cost per document
              </div>
              <div className="mt-1.5 font-display text-[22px] font-bold tabular-nums tracking-[-.05em] text-[#0e0e0e]">
                {usd(stats.processed > 0 ? stats.totalCostUsd / stats.processed : null, 3)}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                Content Understanding OCR plus both model calls, averaged over finished documents.
              </p>
            </div>
          </div>
        </>
      )}

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="font-display text-[13px] font-bold tracking-[-.03em] text-[#0e0e0e]">
            Recent documents
          </h3>
          <button
            onClick={() => onNavigate("/documents")}
            className="text-[10px] font-bold text-[#47a2b0] hover:text-[#37828e] hover:underline"
          >
            View all
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-[11px] text-slate-400">
            No documents yet. Upload a PDF from the Documents tab to start the pipeline.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">
                  <th className="px-5 py-2.5">Document</th>
                  <th className="px-5 py-2.5">Type</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Confidence</th>
                  <th className="px-5 py-2.5">Received</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((doc) => (
                  <tr
                    key={doc.documentId}
                    onClick={() => onOpenDocument(doc.documentId)}
                    className="cursor-pointer border-b border-slate-50 hover:bg-[#ebf5f7]/50"
                  >
                    <td className="px-5 py-2.5 text-[11px] font-bold text-[#0e0e0e]">{doc.file}</td>
                    <td className="px-5 py-2.5 text-[11px] text-slate-600">{humanize(doc.docType)}</td>
                    <td className="px-5 py-2.5">
                      <StatusPill status={doc.uiStatus} />
                    </td>
                    <td className="px-5 py-2.5">
                      <ConfidenceBar value={doc.confidence} />
                    </td>
                    <td className="px-5 py-2.5 text-[11px] text-slate-500">{relativeTime(doc.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
