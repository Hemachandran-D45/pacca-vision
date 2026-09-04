import { useMemo, useState } from "react";
import { Download, Eye, FileSearch, FileText, Filter, RefreshCw, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionHeading } from "@/components/common/SectionHeading";
import { StatusPill } from "@/components/common/StatusPill";
import { documents as mockDocuments, DOCUMENT_TYPES } from "@/data/mockData";
import { fetchDocuments, humanize, relativeTime, percent, usePolled, type DocumentSummary } from "@/senderra/api";

export default function DocumentsPage({
  onNavigate,
  onOpenDocument,
}: {
  onNavigate: (path: string) => void;
  onOpenDocument: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [docType, setDocType] = useState<string>("All Document Types");

  // Live polling for backend documents
  const poller = usePolled(() => fetchDocuments(), 6000);
  const liveDocs = poller.data?.documents ?? [];
  const isLive = liveDocs.length > 0;

  // Unify live pipeline documents with fallback fixtures
  const allDocuments = useMemo(() => {
    if (isLive) {
      return liveDocs.map((d) => ({
        id: d.documentId,
        file: d.file,
        type: d.docType ? humanize(d.docType) : "Prior Authorization",
        source: d.source || "Auto-intake",
        status: (d.uiStatus === "Processed"
          ? "Processed"
          : d.uiStatus === "In HIL Review"
          ? "HIL Review"
          : d.uiStatus === "Processing" || d.uiStatus === "Queued"
          ? "Processing"
          : "Needs Review") as "Processed" | "Needs Review" | "HIL Review" | "Validation failed" | "Processing",
        confidence: percent(d.confidence, 1),
        pages: d.pages ?? 1,
        received: relativeTime(d.receivedAt),
        color: d.uiStatus === "Processed" ? "#45bd8d" : "#f2c94c",
        pdfUrl: `/api/senderra/document?documentId=${encodeURIComponent(d.documentId)}`,
        previewUrl: `/api/senderra/document?documentId=${encodeURIComponent(d.documentId)}`,
      }));
    }
    return mockDocuments;
  }, [isLive, liveDocs]);

  const filtered = useMemo(
    () =>
      allDocuments.filter((d) => {
        const matchesQuery = `${d.id} ${d.file} ${d.type} ${d.source}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesStatus = status === "All statuses" || d.status === status;
        const matchesType = docType === "All Document Types" || d.type === docType;
        return matchesQuery && matchesStatus && matchesType;
      }),
    [allDocuments, query, status, docType]
  );

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-slate-500">Operational document inventory</div>
          <div className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-[#0e0e0e]">
            <span className="h-2 w-2 rounded-full bg-[#45bd8d]" /> Client Workspace · {filtered.length} documents
          </div>
        </div>
        <button
          onClick={() => toast.success("Upload dialog opened", { description: "Dropzone ready for Prior Auth, Invoices, or Clinical Notes." })}
          className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[11px] font-bold text-white shadow-[0_8px_18px_rgba(71,162,176,.18)] transition hover:bg-[#37828e] active:scale-[.98]"
        >
          <Upload size={15} /> Upload document
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
        <div className="flex flex-wrap gap-2">
          <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3">
            <Search size={15} className="text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-[11px] outline-none placeholder:text-slate-400"
              placeholder="Search by ID, filename, patient/vendor, type, or source"
            />
          </label>

          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 outline-none"
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 outline-none"
          >
            <option>All statuses</option>
            <option>Processed</option>
            <option>Needs Review</option>
            <option>Validation failed</option>
            <option>Processing</option>
          </select>

          <button
            onClick={() => toast("Advanced filters", { description: "Additional fields and date ranges will appear here." })}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Filter size={14} /> Filters <span className="rounded bg-[#ebf5f7] px-1.5 py-0.5 text-[9px] font-bold text-[#47a2b0]">2</span>
          </button>
          <button
            onClick={() => toast("Export queued", { description: `${filtered.length} documents will be included.` })}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(20,43,75,.025)]">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <SectionHeading title="All documents" eyebrow={`${filtered.length} shown · ${isLive ? "live pipeline synced" : "updated just now"}`} />
          <button
            onClick={() => void poller.refresh()}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 transition"
            title="Refresh documents from pipeline"
          >
            <RefreshCw size={15} className={poller.loading ? "animate-spin text-[#47a2b0]" : undefined} />
          </button>
        </div>
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  <th className="px-5 py-3 font-bold">Document</th>
                  <th className="px-3 py-3 font-bold">Document Type</th>
                  <th className="px-3 py-3 font-bold">Source</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 font-bold">Confidence</th>
                  <th className="px-3 py-3 font-bold">Pages</th>
                  <th className="px-3 py-3 font-bold">Received</th>
                  <th className="px-5 py-3 font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr
                    key={doc.id}
                    onClick={() => onNavigate(`/documents/${doc.id}`)}
                    className="cursor-pointer border-b border-slate-100 transition hover:bg-[#ebf5f7]/40"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                          <FileText size={16} />
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-[#0e0e0e]">{doc.file}</div>
                          <div className="mt-1 font-mono text-[9px] font-bold text-[#47a2b0]">{doc.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-[10px] font-medium text-slate-700">{doc.type}</td>
                    <td className="px-3 py-4 text-[10px] text-slate-500">{doc.source}</td>
                    <td className="px-3 py-4"><StatusPill status={doc.status} /></td>
                    <td className="px-3 py-4 text-[10px] text-slate-600">{doc.confidence}</td>
                    <td className="px-3 py-4 text-[10px] text-slate-500">{doc.pages}</td>
                    <td className="px-3 py-4 text-[10px] text-slate-500">{doc.received}</td>
                    <td className="px-5 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate(`/documents/${doc.id}`);
                        }}
                        className="rounded-lg p-2 text-slate-400 hover:bg-[#ebf5f7] hover:text-[#47a2b0]"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <EmptyState title="No documents found" copy="Try a different search or clear the filters." icon={FileSearch} />
          </div>
        )}
      </section>
    </div>
  );
}
