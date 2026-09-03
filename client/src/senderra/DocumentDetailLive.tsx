import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, FileText, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FIELD_CLASS_LABEL,
  bytes,
  duration,
  fetchDocument,
  humanize,
  percent,
  relativeTime,
  usd,
  usePolled,
  type ExtractedField,
} from "./api";
import { ConfidenceBar, ErrorBlock, LoadingBlock, ReasonChips, StatusPill } from "./parts";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">{label}</div>
      <div className="mt-2 font-display text-[19px] font-bold tabular-nums tracking-[-.04em] text-[#142b4b]">
        {value}
      </div>
      {hint && <div className="mt-1 text-[9px] text-slate-400">{hint}</div>}
    </div>
  );
}

/**
 * The logical stage timeline for one document.
 *
 * Derived from the two stage records rather than stored anywhere: `ocr` exists
 * once Content Understanding finished, `extract` once both model calls landed.
 * There is no third state to read — a document between them has one record and
 * not the other, which is exactly what "in progress" means here.
 */
function StageTimeline({
  ocr,
  extract,
}: {
  ocr: Record<string, unknown> | null;
  extract: Record<string, unknown> | null;
}) {
  const num = (source: Record<string, unknown> | null, key: string) => {
    const value = source?.[key];
    return typeof value === "number" ? value : null;
  };

  const stages = [
    { name: "Intake", done: true, detail: "Blob write · Event Grid" },
    {
      name: "OCR · Content Understanding",
      done: Boolean(ocr),
      detail: ocr ? `${duration(num(ocr, "cu_latency_ms"))} · ${num(ocr, "page_count") ?? "?"} pages` : "Waiting",
    },
    {
      name: "Classify",
      done: Boolean(extract),
      detail: extract
        ? `${humanize(String(extract.doc_type_predicted ?? ""))} · ${percent(num(extract, "classify_confidence"))}`
        : "Waiting",
    },
    {
      name: "Extract fields",
      done: Boolean(extract),
      detail: extract ? `${num(extract, "field_count") ?? "?"} fields · ${duration(num(extract, "extract_ms"))}` : "Waiting",
    },
    {
      name: "Validate & route",
      done: Boolean(extract),
      detail: extract
        ? extract.needs_review
          ? "Routed to human review"
          : "Straight through"
        : "Waiting",
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="font-display text-[13px] font-bold tracking-[-.03em] text-[#142b4b]">
        Processing timeline
      </h3>
      <div className="mt-4 space-y-3">
        {stages.map((stage, index) => (
          <div key={stage.name} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-0.5 h-2.5 w-2.5 rounded-full ring-4",
                  stage.done ? "bg-emerald-500 ring-emerald-100" : "bg-slate-300 ring-slate-100"
                )}
              />
              {index < stages.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
            </div>
            <div className="pb-2">
              <div className={cn("text-[11px] font-bold", stage.done ? "text-[#142b4b]" : "text-slate-400")}>
                {stage.name}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">{stage.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FieldCard({ name, field }: { name: string; field: ExtractedField }) {
  const score = field.scores?.field_score ?? null;
  const grounding = field.grounding ?? {};
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        field.needs_review ? "border-amber-200 bg-amber-50/40" : "border-slate-100 bg-white"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-[#142b4b]">{humanize(name)}</div>
          <div className="mt-0.5 text-[9px] text-slate-400" title={FIELD_CLASS_LABEL[field.class ?? ""] ?? ""}>
            {field.class ? FIELD_CLASS_LABEL[field.class] ?? `Class ${field.class}` : "—"}
          </div>
        </div>
        <ConfidenceBar value={score} />
      </div>

      <div className="mt-2.5 break-words rounded-lg bg-slate-50 px-3 py-2 text-[12px] font-semibold text-[#142b4b]">
        {field.value === null || field.value === "" ? (
          <span className="font-normal italic text-slate-400">not present</span>
        ) : (
          String(field.value)
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] sm:grid-cols-4">
        <div>
          <dt className="text-slate-400">Model</dt>
          <dd className="font-semibold text-slate-700">{percent(field.scores?.model_confidence)}</dd>
        </div>
        <div>
          <dt className="text-slate-400">OCR</dt>
          <dd className="font-semibold text-slate-700">{percent(field.scores?.ocr_score)}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Grounded</dt>
          <dd className="font-semibold text-slate-700">
            {grounding.quote_in_document ? grounding.match ?? "yes" : "no"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Page</dt>
          <dd className="font-semibold text-slate-700">{grounding.page ?? "—"}</dd>
        </div>
      </dl>

      {field.quote && (
        <div className="mt-2.5 border-l-2 border-slate-200 pl-2.5 text-[10px] italic leading-relaxed text-slate-500">
          “{field.quote}”
        </div>
      )}

      <ReasonChips reasons={field.review_reasons ?? []} className="mt-2.5" />
    </div>
  );
}

export function DocumentDetailLive({
  documentId,
  onBack,
  onReview,
}: {
  documentId: string;
  onBack: () => void;
  onReview: (documentId: string) => void;
}) {
  // Poll only while the document can still change. Once it reaches a terminal
  // state there is nothing left to fetch, and a document left open on a desk
  // would otherwise scan Cosmos every five seconds for the rest of the day.
  const [interval, setInterval] = useState<number | null>(5000);
  const { data, error, loading, refresh } = usePolled(
    () => fetchDocument(documentId),
    interval,
    [documentId]
  );

  useEffect(() => {
    if (!data) return;
    const status = data.summary.uiStatus;
    setInterval(status === "Queued" || status === "Processing" ? 5000 : null);
  }, [data]);

  if (loading && !data) return <div className="p-4 sm:p-7 lg:p-9"><LoadingBlock /></div>;
  if (error) return <div className="p-4 sm:p-7 lg:p-9"><ErrorBlock error={error} onRetry={() => void refresh()} /></div>;
  if (!data) return null;

  const { summary, ocr, extract, fields, review, pdfUrl } = data;
  const fieldEntries = Object.entries(fields?.fields ?? {});
  const flagged = fieldEntries.filter(([, f]) => f.needs_review);
  const clean = fieldEntries.filter(([, f]) => !f.needs_review);
  const num = (source: Record<string, unknown> | null, key: string) => {
    const value = source?.[key];
    return typeof value === "number" ? value : null;
  };

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-500 hover:text-[#156bc9]"
      >
        <ArrowLeft size={14} /> Back to documents
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[24px] font-bold tracking-[-.05em] text-[#142b4b]">
              {summary.file}
            </h1>
            <StatusPill status={summary.uiStatus} />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {humanize(summary.docType)} · run <code className="text-slate-600">{summary.runId}</code> ·{" "}
            {relativeTime(summary.receivedAt)} · {bytes(summary.fileBytes)}
          </p>
          <ReasonChips reasons={summary.reviewReasons} className="mt-3" />
        </div>
        <div className="flex items-center gap-2">
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink size={13} /> Open source PDF
            </a>
          )}
          {summary.needsReview && summary.reviewStatus !== "approved" && (
            <button
              onClick={() => onReview(summary.documentId)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#156bc9] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#0d5aae]"
            >
              <UserRound size={13} /> Open in HIL review
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Field confidence" value={percent(summary.confidence, 1)} hint="min across gates" />
        <Tile
          label="Flagged fields"
          value={`${summary.fieldsNeedingReview ?? 0} / ${summary.fieldCount ?? 0}`}
          hint="hard vetoes only"
        />
        <Tile label="Pages" value={String(summary.pages ?? "—")} hint={`OCR ${percent(num(ocr, "mean_page_confidence"))}`} />
        <Tile label="Cost" value={usd(summary.costUsd, 4)} hint="CU + model, this document" />
        <Tile label="End to end" value={duration(summary.latencyMs)} hint="intake to final metadata" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[13px] font-bold tracking-[-.03em] text-[#142b4b]">
                Extracted metadata
              </h3>
              <span className="text-[10px] text-slate-400">
                {fieldEntries.length} fields · {flagged.length} flagged
              </span>
            </div>

            {fieldEntries.length === 0 ? (
              <p className="mt-4 text-[11px] text-slate-500">
                No field detail yet. Extraction writes this record once both model calls return.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {flagged.length > 0 && (
                  <div>
                    <div className="mb-2 text-[9px] font-bold uppercase tracking-[.1em] text-amber-700">
                      Needs review
                    </div>
                    <div className="grid gap-2.5 md:grid-cols-2">
                      {flagged.map(([name, field]) => (
                        <FieldCard key={name} name={name} field={field} />
                      ))}
                    </div>
                  </div>
                )}
                {clean.length > 0 && (
                  <div>
                    <div className="mb-2 text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">
                      Passed all gates
                    </div>
                    <div className="grid gap-2.5 md:grid-cols-2">
                      {clean.map(([name, field]) => (
                        <FieldCard key={name} name={name} field={field} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {pdfUrl && (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-display text-[13px] font-bold tracking-[-.03em] text-[#142b4b]">
                <FileText size={14} className="text-slate-400" /> Source document
              </h3>
              <iframe
                src={pdfUrl}
                title={`Source PDF for ${summary.file}`}
                className="mt-3 h-[560px] w-full rounded-xl border border-slate-200"
              />
              <p className="mt-2 text-[9px] text-slate-400">
                Served from blob storage with a 30-minute read token. The PDF never passes through the app.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <StageTimeline ocr={ocr} extract={extract} />

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <h3 className="font-display text-[13px] font-bold tracking-[-.03em] text-[#142b4b]">
              Pipeline detail
            </h3>
            <dl className="mt-3 space-y-2 text-[10px]">
              {[
                ["Model", String(extract?.model_deployment ?? "—")],
                ["Analyzer", String(ocr?.analyzer_id ?? "—")],
                ["Prompt cache hit", percent(num(extract, "cache_hit_frac"), 1)],
                ["Prompt tokens", String(num(extract, "prompt_tokens") ?? "—")],
                ["Cached tokens", String(num(extract, "cached_tokens") ?? "—")],
                ["Grounded fraction", percent(num(extract, "grounded_frac"), 1)],
                ["Quote not found", String(num(extract, "quote_not_found") ?? "—")],
                ["Min page confidence", percent(num(ocr, "min_page_confidence"), 1)],
                ["Source", String(summary.source ?? "—")],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="truncate text-right font-semibold text-slate-700">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {review && (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-display text-[13px] font-bold tracking-[-.03em] text-[#142b4b]">
                <ShieldCheck size={14} className="text-slate-400" /> Review history
              </h3>
              <div className="mt-3 space-y-2.5">
                {(review.audit ?? []).map((entry, index) => (
                  <div key={index} className="border-l-2 border-slate-200 pl-3">
                    <div className="text-[10px] font-bold text-[#142b4b]">
                      {humanize(entry.action)}
                      {entry.field ? ` · ${humanize(entry.field)}` : ""}
                    </div>
                    <div className="mt-0.5 text-[9px] text-slate-500">
                      {entry.by} · {relativeTime(entry.at)}
                    </div>
                    {entry.action === "corrected" && (
                      <div className="mt-1 text-[9px] text-slate-500">
                        <span className="line-through">{String(entry.old_value ?? "empty")}</span>
                        {" → "}
                        <span className="font-semibold text-emerald-700">{String(entry.new_value)}</span>
                      </div>
                    )}
                    {entry.note && <div className="mt-1 text-[9px] italic text-slate-500">“{entry.note}”</div>}
                  </div>
                ))}
                {(review.audit ?? []).length === 0 && (
                  <p className="text-[10px] text-slate-400">No reviewer actions recorded.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
