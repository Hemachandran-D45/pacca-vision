import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { REASON_LABEL, STATUS_COLOR, STATUS_INK, percent, type DocumentSummary } from "./api";

export function StatusPill({ status }: { status: DocumentSummary["uiStatus"] }) {
  const color = STATUS_COLOR[status] ?? "#8496ad";
  const ink = STATUS_INK[status] ?? "#495a70";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.06em]"
      style={{ backgroundColor: `${color}1a`, color: ink }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

/**
 * Confidence is `field_score_mean`, which is a min over the gates rather than
 * an average of them — self-reported model confidence can only ever lower it.
 * The bands below match the routing thresholds so the colour and the review
 * decision never disagree on screen.
 */
export function ConfidenceBar({ value }: { value: number | null }) {
  if (typeof value !== "number") return <span className="text-[11px] text-slate-400">—</span>;
  const color = value >= 0.9 ? "#1f9b72" : value >= 0.75 ? "#ed9a25" : "#d6455d";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, backgroundColor: color }}
        />
      </div>
      <span className="tabular-nums text-[11px] font-semibold" style={{ color }}>
        {percent(value)}
      </span>
    </div>
  );
}

export function ReasonChips({ reasons, className }: { reasons: string[]; className?: string }) {
  if (!reasons?.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {reasons.map((reason) => (
        <span
          key={reason}
          title={reason}
          className="rounded-md bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200/70"
        >
          {REASON_LABEL[reason] ?? reason}
        </span>
      ))}
    </div>
  );
}

export function LoadingBlock({ label = "Loading live data…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white py-14 text-[11px] text-slate-500">
      <Loader2 size={15} className="animate-spin text-[#47a2b0]" />
      {label}
    </div>
  );
}

/**
 * The server's own error text, verbatim. A missing app setting and a Cosmos
 * outage need different fixes, and a generic "something went wrong" hides which
 * one happened.
 */
export function ErrorBlock({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-rose-600" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[13px] font-bold text-rose-900">
            Could not reach the Senderra pipeline
          </div>
          <p className="mt-1.5 break-words text-[11px] leading-relaxed text-rose-800/90">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[10px] font-bold text-rose-700 hover:bg-rose-50"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyBlock({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center">
      <div className="font-display text-[14px] font-bold text-[#0e0e0e]">{title}</div>
      <p className="mx-auto mt-2 max-w-sm text-[11px] leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}

export function LiveBadge({ polling = true }: { polling?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
      <span className={cn("h-1.5 w-1.5 rounded-full bg-emerald-500", polling && "animate-pulse")} />
      Live
    </span>
  );
}
