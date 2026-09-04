import { ArrowLeft, Download, FileText, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";
import { StatusPill } from "@/components/common/StatusPill";
import { documents } from "@/data/mockData";

function MockDocumentDetail({
  id,
  onBack,
  onNavigate,
  onReview,
}: {
  id: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onReview?: (documentId: string) => void;
}) {
  const doc = documents.find((d) => d.id === id) ?? documents[0];
  const canEdit = doc.status === "Needs Review" || doc.status === "HIL Review";

  const timeline =
    doc.status === "Needs Review" || doc.status === "HIL Review"
      ? [
          ["Ingest", "Completed", "13:42:02", "green"],
          ["Preprocess", "Completed", "13:42:03", "green"],
          ["Understand / Classify", "Completed", "13:42:05", "green"],
          ["Extract", "Completed", "13:42:07", "green"],
          ["Validate", "Exception (Low Confidence)", "13:42:08", "amber"],
          ["HIL Review", "Awaiting Review", "13:42:09", "amber"],
          ["Deliver", "Waiting", "—", "gray"],
        ]
      : doc.status === "Processing"
        ? [
            ["Ingest", "Completed", "13:54:02", "green"],
            ["Preprocess", "Completed", "13:54:03", "green"],
            ["Understand / Classify", "In Progress", "13:54:04", "blue"],
            ["Extract", "Waiting", "—", "gray"],
            ["Validate", "Waiting", "—", "gray"],
            ["HIL Review", "Not applicable", "—", "gray"],
            ["Deliver", "Waiting", "—", "gray"],
          ]
        : [
            ["Ingest", "Completed", "14:01:02", "green"],
            ["Preprocess", "Completed", "14:01:03", "green"],
            ["Understand / Classify", "Completed", "14:01:04", "green"],
            ["Extract", "Completed", "14:01:06", "green"],
            ["Validate", "Completed", "14:01:07", "green"],
            ["HIL Review", "Not required (STP)", "—", "gray"],
            ["Deliver", "Completed", "14:02:18", "green"],
          ];

  const extractedFields: Array<[string, string, string, string, string, string]> =
    doc.id === "DOC-PA-002"
      ? [
          ["Drug Directions", "Twice daily with meals", "64%", "Needs Review", "Required", "string"],
          ["Dose Form", "Oral Tablet 25mg", "68%", "Needs Review", "Required", "string"],
          ["Patient Name", "María de los angeles Formoso", "98%", "Valid", "Required", "string"],
          ["Date of Birth", "08/12/1960", "97%", "Valid", "Required", "date"],
          ["Member ID", "45000701", "99%", "Valid", "Required", "string"],
          ["Provider NPI", "1700873734", "96%", "Valid", "Required", "string"],
          ["Provider Phone", "954-843-9443", "94%", "Valid", "Required", "string"],
          ["Patient Address", "1420 Brickell Bay Dr, Apt 902, Miami, FL 33131", "91%", "Valid", "Optional", "string"],
        ]
      : doc.type === "Prior Authorization"
      ? [
          ["Patient Name", "Edha Maldonado", "98%", "Valid", "Required", "string"],
          ["Date of Birth", "08/12/1960", "97%", "Valid", "Required", "date"],
          ["Member ID", "45000701", "99%", "Valid", "Required", "string"],
          ["NPI", "1144254210", "95%", "Valid", "Required", "string"],
          ["Insurance Type", "Left TKA", "94%", "Valid", "Required", "string"],
          ["MRN", "13740025", "96%", "Valid", "Required", "string"],
          ["Source System", doc.source, "99%", "Valid", "Required", "string"],
          ["Patient Address", "842 NW 108th Avenue, Coral Springs, FL 33071", "92%", "Valid", "Optional", "string"],
        ]
      : doc.id === "DOC-INV-002" || doc.id === "DOC-002"
        ? [
            ["Invoice Number", "INV-2026-002", "98%", "Valid", "Required", "string"],
            ["Invoice Date", "29-Aug-2026", "97%", "Valid", "Required", "date"],
            ["Vendor Name", "Global Office Supplies", "95%", "Valid", "Required", "string"],
            ["Subtotal", "₹42,000", "94%", "Valid", "Required", "currency"],
            ["Tax Amount", "₹7,560", "93%", "Valid", "Required", "currency"],
            ["Total Amount", "₹49,560", "62%", "Needs Review", "Required", "currency"],
            ["Currency", "INR", "99%", "Valid", "Required", "string"],
            ["Purchase Order Number", "PO-45822", "91%", "Valid", "Optional", "string"],
            ["Due Date", "28-Sep-2026", "89%", "Valid", "Optional", "date"],
          ]
        : [
            ["Invoice Number", "INV-2026-001", "98%", "Valid", "Required", "string"],
            ["Invoice Date", "28-Aug-2026", "97%", "Valid", "Required", "date"],
            ["Vendor Name", "Apex Industrial Co.", "95%", "Valid", "Required", "string"],
            ["Subtotal", "₹36,500", "96%", "Valid", "Required", "currency"],
            ["Tax Amount", "₹6,570", "94%", "Valid", "Required", "currency"],
            ["Total Amount", "₹43,070", "93%", "Valid", "Required", "currency"],
            ["Currency", "INR", "99%", "Valid", "Required", "string"],
          ];

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-[11px] font-bold text-[#47a2b0] hover:text-[#37828e]">
        <ArrowLeft size={15} /> Back to documents
      </button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ebf5f7] text-[#47a2b0]">
            <FileText size={22} />
          </div>
          <div>
            <div className="font-display text-[22px] font-bold tracking-[-.04em] text-[#0e0e0e]">{doc.file}</div>
            <div className="mt-1 font-mono text-[10px] font-bold text-[#47a2b0]">{doc.id}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill status={doc.status} />
              <span className="text-[10px] text-slate-400">Received {doc.received}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => toast("Download prepared")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
            <Download size={14} /> Download
          </button>
          <button onClick={() => toast("Document action menu")} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <SectionHeading title="Document preview" eyebrow={`Page 1 of ${doc.pages} · source rendition`} />
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-[#edf1f5] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[.08em] text-slate-400">Source document · extracted input</span>
              <a href={doc.pdfUrl} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-[#47a2b0] hover:text-[#37828e]">
                Open PDF ↗
              </a>
            </div>
            <div className="flex h-[470px] items-start justify-center overflow-auto rounded-lg bg-slate-100 p-4">
              <iframe src={doc.previewUrl} title={`Source invoice ${doc.id}`} className="h-full w-full max-w-[430px] rounded-md bg-white shadow-sm" />
            </div>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <SectionHeading title="Processing summary" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["Solution", doc.type],
                ["Source", doc.source],
                ["Pages", String(doc.pages)],
                ["Processing time", "7.8s"],
                ["Confidence", doc.confidence],
                ["Correlation ID", "cor_7f42a9"],
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
                    {index < 3 && <div className="absolute left-[5px] top-3 h-7 w-px bg-slate-200" />}
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-[#0e0e0e]">{label}</div>
                      <div
                        className={cn(
                          "text-[9px]",
                          state === "Exception" || state === "Awaiting review"
                            ? "text-amber-700"
                            : state === "In Progress"
                              ? "text-[#47a2b0]"
                              : "text-slate-400"
                        )}
                      >
                        {state} · {time}
                      </div>
                    </div>
                    <span className="font-mono text-[9px] text-slate-400">
                      {state === "Completed" ? "Completed" : state}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            title="Extracted Fields"
            eyebrow={`${doc.type} Metadata Schema · AI Extraction Output`}
          />
          <div className="flex items-center gap-2">
            {canEdit ? (
              <button
                onClick={() => (onReview ? onReview(doc.id) : onNavigate("/hil-review"))}
                className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-3.5 py-2 text-[10px] font-bold text-white shadow-sm hover:bg-[#37828e] transition"
              >
                <Pencil size={13} /> Open in HIL Review
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#45bd8d]/25 bg-[#45bd8d]/10 px-3 py-2 text-[10px] font-bold text-[#1f845d]">
                ✓ Validated · Straight-Through Processing (STP)
              </span>
            )}
            <button
              onClick={() => onNavigate("/metadata-studio")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
            >
              <Pencil size={13} /> Edit schema
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {extractedFields.map(([field, value, confidence, validation, requirement]) => (
            <div
              key={field}
              className={cn(
                "rounded-xl border p-3",
                validation === "Needs Review" ? "border-amber-200 bg-amber-50/40" : "border-slate-100 bg-white"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[10px] font-bold text-[#0e0e0e]">{field}</div>
                <span className={cn("rounded-md px-1.5 py-0.5 text-[8px] font-bold", requirement === "Required" ? "bg-[#ebf5f7] text-[#47a2b0]" : "bg-slate-100 text-slate-500")}>
                  {requirement}
                </span>
              </div>
              <div className="mt-2 text-[12px] font-semibold text-[#0e0e0e]">{value}</div>
              <div className="mt-3 flex items-center justify-between text-[9px]">
                <span className={cn("font-semibold", validation === "Needs Review" ? "text-amber-700" : "text-[#45bd8d]")}>
                  {confidence} confidence
                </span>
                <span className={cn("font-bold", validation === "Needs Review" ? "text-amber-700" : "text-[#45bd8d]")}>
                  {validation === "Needs Review" ? "⚠ Needs Review" : "✓ Valid"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

import { DocumentDetailLive } from "@/senderra/DocumentDetailLive";

export default function DocumentDetailPage({
  id,
  onBack,
  onNavigate,
  onReview,
}: {
  id: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onReview: (documentId: string) => void;
}) {
  const isMock = documents.some((d) => d.id === id);
  if (!isMock) {
    return (
      <DocumentDetailLive
        documentId={id}
        onBack={onBack}
        onReview={onReview}
      />
    );
  }
  return <MockDocumentDetail id={id} onBack={onBack} onNavigate={onNavigate} onReview={onReview} />;
}
