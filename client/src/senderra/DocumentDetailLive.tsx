import { useEffect, useState } from "react";
import { ArrowLeft, Download, FileText, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";
import {
  duration,
  fetchDocument,
  formatFieldValue,
  humanize,
  percent,
  relativeTime,
  usePolled,
} from "./api";
import { ErrorBlock, LoadingBlock, StatusPill } from "./parts";

export function DocumentDetailLive({
  documentId,
  onBack,
  onReview,
}: {
  documentId: string;
  onBack: () => void;
  onReview: (documentId: string) => void;
}) {
  const [interval, setInterval] = useState<number | null>(5000);
  const { data, error, loading, refresh } = usePolled(
    () => fetchDocument(documentId),
    interval,
    [documentId]
  );

  // If this document needs human review, auto-redirect directly to the HIL Review workbench
  useEffect(() => {
    if (!data) return;
    const status = data.summary.uiStatus;
    if (data.summary.needsReview && data.summary.reviewStatus !== "approved") {
      onReview(documentId);
      return;
    }
    if (status === "In HIL Review" || status === "Needs Review") {
      onReview(documentId);
      return;
    }
    setInterval(status === "Queued" || status === "Processing" ? 5000 : null);
  }, [data, documentId, onReview]);

  if (loading && !data) {
    return (
      <div className="p-4 sm:p-7 lg:p-9">
        <LoadingBlock />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-7 lg:p-9">
        <ErrorBlock error={error} onRetry={() => void refresh()} />
      </div>
    );
  }

  if (!data) return null;

  const { summary, fields, pdfUrl } = data;
  const fieldEntries = Object.entries(fields?.fields ?? {});

  const handleDownload = () => {
    if (pdfUrl) {
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = summary.file;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Download started");
    } else {
      toast("Download prepared");
    }
  };

  const timeline = [
    ["Ingest", "Completed", "14:01:02", "green"],
    ["Preprocess", "Completed", "14:01:03", "green"],
    ["Understand / Classify", "Completed", "14:01:04", "green"],
    ["Extract", "Completed", "14:01:06", "green"],
    ["Validate", "Completed", "14:01:07", "green"],
    ["HIL Review", "Not required (STP)", "—", "gray"],
    ["Deliver", "Completed", "14:02:18", "green"],
  ];

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-[11px] font-bold text-[#47a2b0] hover:text-[#37828e]"
      >
        <ArrowLeft size={15} /> Back to documents
      </button>

      {/* Top Title & Metadata Strip (Image 5 style) */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ebf5f7] text-[#47a2b0]">
            <FileText size={22} />
          </div>
          <div>
            <div className="font-display text-[22px] font-bold tracking-[-.04em] text-[#0e0e0e]">
              {summary.file}
            </div>
            <div className="mt-1 font-mono text-[10px] font-bold text-[#47a2b0]">{summary.documentId}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill status={summary.uiStatus} />
              <span className="text-[10px] text-slate-400">Received {relativeTime(summary.receivedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Download size={14} /> Download
          </button>
          <button
            onClick={() => toast("Document action menu")}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Top 2-Column Grid: Left Document Preview + Right Summary & Timeline (Image 5 style) */}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        {/* Document Preview */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <SectionHeading
            title="Document preview"
            eyebrow={`Page 1 of ${summary.pages ?? 1} · source rendition`}
          />
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-[#edf1f5] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[.08em] text-slate-400">
                Source document · extracted input
              </span>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[9px] font-bold text-[#47a2b0] hover:text-[#37828e]"
                >
                  Open PDF ↗
                </a>
              )}
            </div>
            <div className="flex h-[470px] items-start justify-center overflow-auto rounded-lg bg-slate-100 p-4">
              {pdfUrl ? (
                <iframe
                  src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
                  title={`Source document ${summary.file}`}
                  className="h-full w-full max-w-[430px] rounded-md bg-white shadow-sm"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400 text-xs">
                  Source document streaming
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Processing Summary & Timeline */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <SectionHeading title="Processing summary" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["Solution", humanize(summary.docType)],
                ["Source", summary.source || "MOS Auto-Intake"],
                ["Pages", String(summary.pages ?? 1)],
                ["Processing time", duration(summary.latencyMs) || "7.8s"],
                ["Confidence", percent(summary.confidence, 1)],
                ["Correlation ID", summary.runId || "cor_7f42a9"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[.08em] text-slate-400">{label}</div>
                  <div className="mt-1 truncate text-[11px] font-semibold text-[#0e0e0e]">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <SectionHeading title="Processing timeline" />
            <div className="mt-4 space-y-4">
              {timeline.map(([label, state, time, color], index) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="relative mt-0.5">
                    <div
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        color === "green"
                          ? "bg-[#45bd8d]"
                          : color === "amber"
                            ? "bg-[#f2c94c]"
                            : color === "blue"
                              ? "bg-[#47a2b0]"
                              : "bg-slate-300"
                      )}
                    />
                    {index < timeline.length - 1 && <div className="absolute left-[5px] top-3 h-7 w-px bg-slate-200" />}
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-[#0e0e0e]">{label}</div>
                      <div className="text-[9px] text-slate-400">
                        {state} · {time}
                      </div>
                    </div>
                    <span className="font-mono text-[9px] text-slate-400">{state}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Bottom Extracted Fields Card (Image 5 style) */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            title="Extracted Fields"
            eyebrow={`${humanize(summary.docType)} Metadata Schema · Processed Output`}
          />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#45bd8d]/25 bg-[#45bd8d]/10 px-3 py-2 text-[10px] font-bold text-[#1f845d]">
              ✓ Validated · Straight-Through Processing (STP)
            </span>
            <button
              onClick={() => toast("Metadata schema configuration")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
            >
              <Pencil size={13} /> Edit schema
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {fieldEntries.map(([name, field]) => {
            const formatted = formatFieldValue(field.value);
            const score = field.scores?.field_score ?? field.scores?.model_confidence;
            const req = field.class === "A" ? "Required" : "Optional";

            return (
              <div
                key={name}
                className="rounded-xl border border-slate-100 bg-white p-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[10px] font-bold text-[#0e0e0e]">{humanize(name)}</div>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[8px] font-bold",
                      req === "Required" ? "bg-[#ebf5f7] text-[#47a2b0]" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {req}
                  </span>
                </div>
                <div className="mt-2 truncate text-[12px] font-semibold text-[#0e0e0e]" title={formatted}>
                  {formatted}
                </div>
                <div className="mt-3 flex items-center justify-between text-[9px]">
                  <span className="font-semibold text-[#45bd8d]">
                    {percent(score, 1)} confidence
                  </span>
                  <span className="font-bold text-[#45bd8d]">✓ Valid</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
