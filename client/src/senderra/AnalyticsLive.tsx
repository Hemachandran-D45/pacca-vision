import { AlertTriangle, Check, Coins, FileStack, Gauge, PiggyBank, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fetchAnalytics, duration, humanize, percent, usd, usePolled } from "./api";
import { ErrorBlock, LiveBadge, LoadingBlock } from "./parts";

/**
 * Categorical slots, light mode, from the validated reference palette.
 *
 * The four-slot set passes the lightness band, chroma floor, adjacent CVD
 * separation (worst ΔE 9.1) and the normal-vision floor (worst ΔE 22.9). Aqua
 * and yellow sit below 3:1 against a light surface, which triggers the relief
 * rule — so every chart using them ships a legend carrying the actual value,
 * and identity is never colour alone.
 */
const SERIES = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
} as const;

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="font-display text-[13px] font-bold tracking-[-.03em] text-[#0e0e0e]">{title}</h3>
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ebf5f7] text-[#47a2b0]">
        <Icon size={17} />
      </div>
      <div className="mt-5 text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</div>
      <div className="mt-1.5 font-display text-[24px] font-bold tabular-nums leading-none tracking-[-.05em] text-[#0e0e0e]">
        {value}
      </div>
      <div className="mt-2.5 text-[10px] leading-relaxed text-slate-400">{hint}</div>
    </div>
  );
}

/**
 * A single stacked bar with its legend carrying the numbers.
 *
 * One axis, one total — the segments are parts of the same measure. A 2px
 * surface gap separates fills so adjacent segments never touch, and the legend
 * repeats each value as text, which is what satisfies the relief rule for the
 * two slots below 3:1 contrast.
 */
function StackedBar({
  segments,
  format,
}: {
  segments: { label: string; value: number; color: string }[];
  format: (value: number) => string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return <p className="text-[11px] text-slate-400">No data yet.</p>;
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px]">
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <div
              key={segment.label}
              className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
              style={{
                width: `${(segment.value / total) * 100}%`,
                backgroundColor: segment.color,
              }}
              title={`${segment.label}: ${format(segment.value)}`}
            />
          ))}
      </div>
      <div className="mt-3.5 space-y-1.5">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: segment.color }}
            />
            <span className="flex-1 text-[10px] font-semibold text-slate-600">{segment.label}</span>
            <span className="tabular-nums text-[11px] font-bold text-[#0e0e0e]">
              {format(segment.value)}
            </span>
            <span className="w-10 text-right tabular-nums text-[10px] text-slate-400">
              {Math.round((segment.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Single-series magnitude across named categories: one hue, sorted, values
 * labelled directly. Cycling hues here would invent a distinction the data does
 * not have — the row label is the identity.
 */
function BarList({
  rows,
  format,
  color = SERIES.blue,
  labelWidth = "150px",
}: {
  rows: { label: string; value: number; sub?: string }[];
  format: (value: number) => string;
  color?: string;
  labelWidth?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <p className="text-[11px] text-slate-400">No data yet.</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <div className="shrink-0 truncate text-[10px] font-semibold text-slate-600" style={{ width: labelWidth }}>
            {row.label}
            {row.sub && <span className="ml-1 font-normal text-slate-400">{row.sub}</span>}
          </div>
          <div className="h-3 flex-1 overflow-hidden rounded-r-[4px] bg-slate-50">
            <div
              className="h-full rounded-r-[4px] transition-[width] duration-500"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, backgroundColor: color }}
            />
          </div>
          <div className="w-16 shrink-0 text-right tabular-nums text-[11px] font-bold text-[#0e0e0e]">
            {format(row.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Guard({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2.5">
      {ok ? (
        <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0">
        <div className={ok ? "text-[10px] font-bold text-[#0e0e0e]" : "text-[10px] font-bold text-amber-800"}>
          {label}
        </div>
        <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{detail}</div>
      </div>
    </div>
  );
}

export function AnalyticsLive() {
  const { data, error, loading, refresh } = usePolled(() => fetchAnalytics(), 15000);
  const a = data?.analytics;

  if (loading && !a) return <div className="p-4 sm:p-7 lg:p-9"><LoadingBlock /></div>;
  if (error) return <div className="p-4 sm:p-7 lg:p-9"><ErrorBlock error={error} onRetry={() => void refresh()} /></div>;
  if (!a) return null;

  const cacheSavingPct =
    a.totals.llmUncachedUsd > 0 ? a.totals.cacheSavingUsd / a.totals.llmUncachedUsd : null;
  const reviewedFieldPct =
    a.quality.fieldsTotal > 0 ? a.quality.fieldsNeedingReview / a.quality.fieldsTotal : null;
  const gatedDocs = a.gates.documentReasons.reduce((sum, r) => sum + r.count, 0);

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
            Analytics &amp; Cost
          </h1>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Measured per document by the pipeline — Content Understanding and the model both report
            actual usage. Nothing on this page is a modelled rate.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          icon={Coins}
          label="Total spend"
          value={usd(a.totals.spendUsd, 3)}
          hint={`${a.totals.documents} documents · ${a.totals.pagesBilled} pages billed`}
        />
        <Metric
          icon={FileStack}
          label="Cost per document"
          value={usd(a.totals.costPerDoc, 4)}
          hint={`${usd(a.totals.costPerPage, 4)} per page`}
        />
        <Metric
          icon={Gauge}
          label="Cost per 1,000 pages"
          value={usd(a.totals.costPer1kPages, 2)}
          hint="the volume-independent unit for comparing runs"
        />
        <Metric
          icon={PiggyBank}
          label="Prompt-cache saving"
          value={usd(a.totals.cacheSavingUsd, 4)}
          hint={`${percent(cacheSavingPct, 1)} off the model bill · ${percent(a.tokens.cacheHitFrac, 1)} of prompt tokens cached`}
        />
        <Metric
          icon={Timer}
          label="Mean pipeline time"
          value={duration(a.latency.pipelineMeanMs)}
          hint={`slowest ${duration(a.latency.pipelineMaxMs)}${a.latency.composedFloor ? " · a floor, see below" : ""}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Where the money goes"
          hint="Content Understanding OCR against the two model calls, summed over every document."
        >
          <StackedBar
            segments={[
              { label: "Content Understanding (OCR)", value: a.totals.cuUsd, color: SERIES.blue },
              { label: "Model (classify + extract)", value: a.totals.llmUsd, color: SERIES.orange },
            ]}
            format={(value) => usd(value, 4)}
          />
          <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
            <div className="text-[10px] font-bold text-[#0e0e0e]">Prompt cache, measured</div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
              Uncached these calls would have cost{" "}
              <span className="font-bold text-slate-700">{usd(a.totals.llmUncachedUsd, 4)}</span>. They cost{" "}
              <span className="font-bold text-slate-700">{usd(a.totals.llmUsd, 4)}</span> — a saving of{" "}
              <span className="font-bold text-emerald-700">{usd(a.totals.cacheSavingUsd, 4)}</span>.
              The cache breaks silently if anything is inserted before the markdown in the prompt, so
              this figure is the only warning you get.
            </p>
          </div>
        </Card>

        <Card
          title="Mean pipeline time by stage"
          hint="The three recorded spans that compose: the intake queue wait, stage 1, and stage 2."
        >
          <StackedBar
            segments={[
              { label: "Intake queue wait", value: a.latency.queueWaitMs ?? 0, color: SERIES.blue },
              { label: "Stage 1 · OCR", value: a.latency.stage1Ms ?? 0, color: SERIES.orange },
              { label: "Stage 2 · classify + extract", value: a.latency.stage2Ms ?? 0, color: SERIES.aqua },
            ]}
            format={(value) => duration(value)}
          />
          <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
            <div className="text-[10px] font-bold text-[#0e0e0e]">Inside stage 2</div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
              Classify {duration(a.latency.classifyMs)} · extract {duration(a.latency.extractMs)}. The
              extract call dominates because it carries the markdown and the field schema; the classify
              call reuses the same cached prefix.
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Spend by document type" hint="Total cost, and what drives it.">
          <BarList
            rows={a.byDocType.map((row) => ({
              label: humanize(row.docType),
              sub: `· ${row.count}`,
              value: row.spendUsd,
            }))}
            format={(value) => usd(value, 4)}
          />
        </Card>

        <Card
          title="Token economics"
          hint="Cached prompt tokens are billed at a fraction of the uncached rate — this ratio is the lever."
        >
          <StackedBar
            segments={[
              { label: "Prompt, uncached", value: a.tokens.prompt - a.tokens.cached, color: SERIES.blue },
              { label: "Prompt, served from cache", value: a.tokens.cached, color: SERIES.aqua },
              { label: "Completion", value: a.tokens.completion, color: SERIES.orange },
            ]}
            format={(value) => value.toLocaleString()}
          />
          <p className="mt-3.5 text-[10px] leading-relaxed text-slate-400">
            {a.tokens.reasoning.toLocaleString()} of the completion tokens were reasoning tokens.
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Why fields go to review"
          hint="Each gate is independent and carries its own reason code — they are never collapsed into one number, because they route to different actions."
        >
          <BarList
            rows={a.gates.fieldReasons.map((row) => ({
              label: humanize(row.reason),
              value: row.count,
            }))}
            format={(value) => String(value)}
          />
          <div className="mt-4 border-t border-slate-100 pt-3.5 text-[10px] leading-relaxed text-slate-500">
            <span className="font-bold text-[#0e0e0e]">
              {a.quality.fieldsNeedingReview} of {a.quality.fieldsTotal} fields
            </span>{" "}
            ({percent(reviewedFieldPct, 1)}) tripped a gate, across{" "}
            <span className="font-bold text-[#0e0e0e]">{gatedDocs}</span> document-level routings.
            Straight-through rate is{" "}
            <span className="font-bold text-[#0e0e0e]">{percent(a.quality.stpRate, 1)}</span> —{" "}
            {a.quality.stpCount} of {a.totals.succeeded} documents needed no human at all.
          </div>
        </Card>

        <Card
          title="Field confidence distribution"
          hint="field_score is a min across the gates, so self-reported model confidence can only ever lower it."
        >
          <BarList
            rows={a.confidenceHistogram.map((row) => ({ label: row.label, value: row.count }))}
            format={(value) => String(value)}
            labelWidth="80px"
          />
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3.5 text-[10px]">
            <div className="flex justify-between">
              <dt className="text-slate-400">Mean field score</dt>
              <dd className="font-bold text-slate-700">{percent(a.quality.avgFieldScore, 1)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Mean OCR confidence</dt>
              <dd className="font-bold text-slate-700">{percent(a.quality.avgOcrConf, 1)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Grounded fraction</dt>
              <dd className="font-bold text-slate-700">{percent(a.quality.avgGroundedFrac, 1)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Quote not found</dt>
              <dd className="font-bold text-slate-700">{a.quality.quoteNotFound}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Spend by day" hint="Days on which documents were actually processed.">
          <BarList
            rows={a.costTrend.map((row) => ({
              label: row.day,
              sub: `· ${row.documents} doc${row.documents === 1 ? "" : "s"}`,
              value: row.spend,
            }))}
            format={(value) => usd(value, 4)}
            labelWidth="150px"
          />
        </Card>

        <Card
          title="Cost guards"
          hint="Three settings that cost money silently — none of them produce an error when they drift."
        >
          <div className="space-y-3.5">
            <Guard
              ok={a.guards.contextualizationUsd === 0}
              label={
                a.guards.contextualizationUsd === 0
                  ? "Contextualisation is off"
                  : `Contextualisation billed ${usd(a.guards.contextualizationUsd, 4)}`
              }
              detail={`${a.guards.contextualizationTokens} tokens. A non-empty fieldSchema on either analyzer turns this meter back on — it is the single largest accidental cost.`}
            />
            <Guard
              ok={a.guards.pagesBasic === 0}
              label={`Layout analyzer on all ${a.guards.pagesStandard} pages`}
              detail={`${a.guards.pagesBasic} pages ran without layout. Layout on/off is the biggest deliberate cost lever in the pipeline.`}
            />
            <Guard
              ok={a.guards.throttleCount === 0}
              label={
                a.guards.throttleCount === 0 ? "No model throttling" : `${a.guards.throttleCount} throttle events`
              }
              detail="Throttling inflates latency and retries, and shows up as a cost outlier before it shows up as an error."
            />
          </div>
          <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3.5 text-[10px]">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Analyzer</dt>
              <dd className="truncate font-semibold text-slate-700">{a.guards.analyzers.join(", ") || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Model</dt>
              <dd className="truncate font-semibold text-slate-700">{a.guards.models.join(", ") || "—"}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
