import { useEffect, useMemo, useState } from "react";
import type { UploadedDocInfo } from "@/components/documents/UploadDocumentModal";
import { Copy, Download, Eye, FileSearch, FileText, Filter, RefreshCw, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionHeading } from "@/components/common/SectionHeading";
import { StatusPill } from "@/components/common/StatusPill";
import { fetchDocuments, humanize, relativeTime, formatTimestamp, percent, usePolled } from "@/senderra/api";
import { ErrorBlock } from "@/senderra/parts";
import {
  UploadDocumentModal,
  DEPARTMENT_DEFAULT_DOC_TYPE,
  resolveUploadDocType,
} from "@/components/documents/UploadDocumentModal";
import {
  getStoredUploadedDocs,
  saveStoredUploadedDocs,
  pruneStoredUploadedDocs,
  PACCA_UPLOADED_DOCS_EVENT,
} from "@/senderra/localDocs";

function listStatus(uiStatus: string) {
  if (uiStatus === "Processed") return "Processed" as const;
  if (uiStatus === "Routed to IVR") return "Routed to IVR" as const;
  if (uiStatus === "In HIL Review") return "HIL Review" as const;
  if (uiStatus === "Processing") return "Processing" as const;
  if (uiStatus === "Queued") return "Queued" as const;
  if (uiStatus === "Failed") return "Validation failed" as const;
  return "Needs Review" as const;
}

function inferDocType(docType: string | null | undefined, file: string, source?: string | null): string {
  if (docType && docType.trim()) {
    const lower = docType.toLowerCase();
    if (lower === "clinicalnotes") return "Clinical Note";
    return humanize(docType);
  }
  const fn = (file || "").toLowerCase();
  if (fn.includes("prescription") || fn.includes("rx")) return "Specialty Prescription";
  if (fn.includes("clinical") || fn.includes("note")) return "Clinical Note";
  if (fn.includes("referral")) return "Referral Form";
  if (fn.includes("eob") || fn.includes("explanation")) return "Explanation of Benefits";
  if (fn.includes("invoice") || fn.includes("bill") || fn.includes("claim")) return "CMS-1500 Claim Form";
  if (fn.includes("appeal")) return "Appeal Checklist";
  if (fn.includes("prior_auth") || fn.includes("pa_") || fn.includes("determination")) return "Prior Authorization";
  if (source && source.includes("·")) {
    const dept = source.split("·")[1]?.trim();
    if (dept && DEPARTMENT_DEFAULT_DOC_TYPE[dept]) return DEPARTMENT_DEFAULT_DOC_TYPE[dept];
  }
  return "Specialty Prescription";
}

function toOptimisticRow(item: UploadedDocInfo) {
  return {
    id: item.documentId,
    file: item.file,
    type: item.docType || resolveUploadDocType("", item.department, item.file),
    source: `Upload · ${item.department}`,
    timestamp: formatTimestamp(item.uploadedAt || new Date().toISOString()),
    status: "Queued" as const,
    confidence: "—",
    pages: "—" as const,
    received: "Just now",
    color: "#8496ad",
    pdfUrl: `/api/senderra/document?documentId=${encodeURIComponent(item.documentId)}`,
    previewUrl: `/api/senderra/document?documentId=${encodeURIComponent(item.documentId)}`,
    isDuplicate: false,
    duplicateOf: undefined as string | undefined,
    duplicateReason: undefined as string | undefined,
  };
}

export default function DocumentsPage({
  onNavigate,
  onOpenDocument,
  onOpenHil,
}: {
  onNavigate: (path: string) => void;
  onOpenDocument?: (id: string) => void;
  onOpenHil?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [docType, setDocType] = useState<string>("All Document Types");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadedLocalDocs, setUploadedLocalDocs] = useState<ReturnType<typeof toOptimisticRow>[]>(() =>
    getStoredUploadedDocs().map(toOptimisticRow)
  );

  // Sync uploaded docs across tabs or after uploads
  useEffect(() => {
    const sync = () => {
      setUploadedLocalDocs(getStoredUploadedDocs().map(toOptimisticRow));
    };
    window.addEventListener(PACCA_UPLOADED_DOCS_EVENT, sync);
    return () => window.removeEventListener(PACCA_UPLOADED_DOCS_EVENT, sync);
  }, []);

  // Live polling for backend documents
  const poller = usePolled(() => fetchDocuments(), 6000);
  const liveDocs = poller.data?.documents ?? [];
  const isLive = Boolean(poller.data);

  // Prune local uploads once Azure Cosmos returns them
  useEffect(() => {
    if (liveDocs.length > 0) {
      const liveIds = liveDocs.map((d) => d.documentId);
      const liveFiles = liveDocs.map((d) => d.file || "");
      pruneStoredUploadedDocs(liveIds, liveFiles);
    }
  }, [liveDocs]);

  const allDocuments = useMemo(() => {
    const baseDocs = liveDocs.map((d) => ({
      id: d.documentId,
      file: d.file,
      type: inferDocType(d.docType, d.file, d.source),
      source: d.source || "Auto-intake",
      timestamp: formatTimestamp(d.receivedAt),
      status: listStatus(d.uiStatus),
      confidence: percent(d.confidence, 1),
      pages: d.pages ?? "—",
      received: relativeTime(d.receivedAt),
      color:
        d.uiStatus === "Processed"
          ? "#45bd8d"
          : d.uiStatus === "Routed to IVR"
          ? "#6366f1"
          : d.uiStatus === "Queued" || d.uiStatus === "Processing"
          ? "#8496ad"
          : "#f2c94c",
      pdfUrl: `/api/senderra/document?documentId=${encodeURIComponent(d.documentId)}`,
      previewUrl: `/api/senderra/document?documentId=${encodeURIComponent(d.documentId)}`,
      isDuplicate: Boolean(d.isDuplicate),
      duplicateOf: d.duplicateOf,
      duplicateReason: d.duplicateReason,
    }));

    const liveIdSet = new Set(baseDocs.flatMap((row) => [row.id, row.id.replace(/\.pdf$/i, "")]));
    const liveFileSet = new Set(baseDocs.map((row) => (row.file || "").toLowerCase().trim()));

    const locals = uploadedLocalDocs.filter(
      (row) =>
        row.id &&
        !liveIdSet.has(row.id) &&
        !liveIdSet.has(row.id.replace(/\.pdf$/i, "")) &&
        !liveFileSet.has((row.file || "").toLowerCase().trim())
    );
    return [...locals, ...baseDocs];
  }, [liveDocs, uploadedLocalDocs]);

  // Dynamically compute all available document types from the live inventory
  const availableDocTypes = useMemo(() => {
    const typesSet = new Set<string>();
    allDocuments.forEach((d) => {
      if (d.type && d.type.trim()) {
        typesSet.add(d.type.trim());
      }
    });
    if (typesSet.size === 0) {
      return ["All Document Types", "Referral Form", "Patient Demographics", "Clinical Note", "Denial Letter"];
    }
    const sorted = Array.from(typesSet).sort();
    return ["All Document Types", ...sorted];
  }, [allDocuments]);

  const filtered = useMemo(() => {
    const rawQuery = query.toLowerCase().trim();
    if (!rawQuery && status === "All statuses" && docType === "All Document Types") {
      return allDocuments;
    }

    const tokens = rawQuery
      .replace(/[,/\\#$%=?_]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    return allDocuments.filter((d) => {
      // 1. Search Query Matching (Multi-token + loose matching)
      let matchesQuery = true;
      if (tokens.length > 0) {
        // Expand row text with synonyms and stripped punctuation
        const baseRow = `${d.id} ${d.file} ${d.type} ${d.source || ""} ${d.timestamp || ""} ${d.status || ""} ${d.confidence || ""} ${d.isDuplicate ? "duplicate duplicate-detected already-processed" : ""} ${d.received || ""}`
          .toLowerCase();
        const cleanRow = baseRow.replace(/[,/\\#$%=?_.-]/g, " ");
        const rowWords = cleanRow.split(/\s+/).filter(Boolean);

        matchesQuery = tokens.every((token) => {
          // Direct substring match anywhere in row
          if (baseRow.includes(token) || cleanRow.includes(token)) return true;

          // Special month aliases (e.g. "september" matches "sep", "august" matches "aug")
          if (token === "september" && cleanRow.includes("sep")) return true;
          if (token === "october" && cleanRow.includes("oct")) return true;
          if (token === "november" && cleanRow.includes("nov")) return true;
          if (token === "december" && cleanRow.includes("dec")) return true;

          // Typo tolerance for words 4+ chars (e.g., "clincal" -> "clinical", "referal" -> "referral")
          if (token.length >= 4) {
            for (const word of rowWords) {
              if (Math.abs(word.length - token.length) <= 1) {
                let diffs = 0;
                let i = 0;
                let j = 0;
                while (i < token.length && j < word.length) {
                  if (token[i] !== word[j]) {
                    diffs++;
                    if (diffs > 1) break;
                    if (token.length > word.length) i++;
                    else if (word.length > token.length) j++;
                    else {
                      i++;
                      j++;
                    }
                  } else {
                    i++;
                    j++;
                  }
                }
                if (diffs <= 1) return true;
              }
            }
          }
          return false;
        });
      }

      // 2. Status Matching
      const matchesStatus =
        status === "All statuses" ||
        (status === "Needs Review" && (d.status === "Needs Review" || d.status === "HIL Review")) ||
        (status === "HIL Review" && (d.status === "HIL Review" || d.status === "Needs Review")) ||
        (status === "Duplicate" && (d.isDuplicate || d.status === "Duplicate")) ||
        (status === "Validation failed" && (d.status === "Validation failed" || d.status === "Failed")) ||
        (d.status && d.status.toLowerCase().trim() === status.toLowerCase().trim());

      // 3. Document Type Matching
      const matchesType =
        docType === "All Document Types" ||
        (d.type && d.type.toLowerCase().trim() === docType.toLowerCase().trim());

      return matchesQuery && matchesStatus && matchesType;
    });
  }, [allDocuments, query, status, docType]);

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium text-slate-600">Operational document inventory</div>
          <div className="mt-1 flex items-center gap-2 text-[13px] font-bold text-[#0e0e0e]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#45bd8d]" /> Client Workspace · {filtered.length} documents
          </div>
        </div>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[12px] font-bold text-white shadow-[0_8px_18px_rgba(71,162,176,.2)] transition hover:bg-[#37828e] active:scale-[.98]"
        >
          <Upload size={15} /> Upload document
        </button>
      </div>

      {/* Prominent Search & Filters Card */}
      <section className="rounded-2xl border border-slate-300/80 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-11 min-w-[260px] flex-1 items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 shadow-xs transition focus-within:border-[#47a2b0] focus-within:ring-2 focus-within:ring-[#47a2b0]/20">
            <Search size={17} className="shrink-0 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-[12px] font-medium text-slate-900 outline-none placeholder:text-slate-500"
              placeholder="Search by ID, filename, status, type, timestamp..."
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </label>

          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="h-11 min-w-[160px] rounded-xl border border-slate-300 bg-white px-3.5 text-[12px] font-semibold text-slate-800 shadow-xs outline-none cursor-pointer transition hover:border-slate-400 focus:border-[#47a2b0] focus:ring-2 focus:ring-[#47a2b0]/20"
          >
            {availableDocTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 min-w-[150px] rounded-xl border border-slate-300 bg-white px-3.5 text-[12px] font-semibold text-slate-800 shadow-xs outline-none cursor-pointer transition hover:border-slate-400 focus:border-[#47a2b0] focus:ring-2 focus:ring-[#47a2b0]/20"
          >
            <option value="All statuses">All statuses</option>
            <option value="Processed">Processed</option>
            <option value="Needs Review">Needs Review</option>
            <option value="HIL Review">HIL Review</option>
            <option value="Duplicate">Duplicate</option>
            <option value="Routed to IVR">Routed to IVR</option>
            <option value="Processing">Processing</option>
            <option value="Queued">Queued</option>
            <option value="Validation failed">Validation failed</option>
          </select>

          <button
            onClick={() => {
              setQuery("");
              setStatus("All statuses");
              setDocType("All Document Types");
            }}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-[12px] font-semibold text-slate-700 shadow-xs hover:bg-slate-100 transition active:scale-[.98]"
          >
            <Filter size={13} /> Reset
          </button>

          <button
            onClick={() => toast("Export queued", { description: `${filtered.length} documents will be included.` })}
            className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-[12px] font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition active:scale-[.98]"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </section>

      {/* Documents Table Section */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/80 p-5">
          <SectionHeading
            title="All documents"
            eyebrow={`${filtered.length} shown · ${isLive ? "live Azure pipeline" : poller.loading ? "connecting to Azure…" : "live pipeline"}`}
          />
          <button
            onClick={() => void poller.refresh()}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition"
            title="Refresh documents from pipeline"
          >
            <RefreshCw size={15} className={poller.loading ? "animate-spin text-[#47a2b0]" : undefined} />
          </button>
        </div>
        {poller.error && (
          <div className="px-5 pt-4">
            <ErrorBlock error={poller.error} onRetry={() => void poller.refresh()} />
          </div>
        )}
        {poller.loading && !isLive && filtered.length === 0 && !poller.error ? (
          <div className="p-8 text-center text-[12px] font-semibold text-slate-600">
            Loading documents from Azure…
          </div>
        ) : filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/90 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-700">
                  <th className="px-5 py-3.5">Document</th>
                  <th className="px-3 py-3.5">Document Type</th>
                  <th className="px-3 py-3.5">Timestamp</th>
                  <th className="px-3 py-3.5">Status</th>
                  <th className="px-3 py-3.5">Confidence</th>
                  <th className="px-3 py-3.5">Pages</th>
                  <th className="px-3 py-3.5">Received</th>
                  <th className="px-5 py-3.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => {
                  const needsReview = doc.status === "Needs Review" || doc.status === "HIL Review";
                  const handleOpen = () => {
                    if (needsReview && onOpenHil) {
                      onOpenHil(doc.id);
                      return;
                    }
                    if (onOpenDocument) {
                      onOpenDocument(doc.id);
                    } else {
                      onNavigate(`/documents/${encodeURIComponent(doc.id)}`);
                    }
                  };

                  return (
                    <tr
                      key={doc.id}
                      onClick={handleOpen}
                      className="cursor-pointer border-b border-slate-100 transition hover:bg-[#ebf5f7]/50"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                            <FileText size={17} />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-bold text-[#0e0e0e]">{doc.file}</div>
                            <div className="mt-1 truncate font-mono text-[10px] font-bold text-[#1b6b77]">{doc.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-[11px] font-bold text-slate-800">{doc.type}</td>
                      <td className="px-3 py-4 font-mono text-[11px] font-semibold text-slate-700">{doc.timestamp}</td>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusPill status={doc.status} />
                          {doc.isDuplicate && (
                            <span
                              title={doc.duplicateReason || `Duplicate of ${doc.duplicateOf}`}
                              className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[9px] font-extrabold text-purple-900 ring-1 ring-purple-300 shadow-xs"
                            >
                              <Copy size={9} className="shrink-0 stroke-[2.5]" />
                              Duplicate
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-[11px] font-bold text-slate-900">{doc.confidence}</td>
                      <td className="px-3 py-4 text-[11px] font-semibold text-slate-700">{doc.pages}</td>
                      <td className="px-3 py-4 text-[11px] font-semibold text-slate-700">{doc.received}</td>
                      <td className="px-5 py-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpen();
                          }}
                          className="rounded-lg p-2 text-slate-500 hover:bg-[#ebf5f7] hover:text-[#1b6b77] transition"
                          title={needsReview ? "Open in HIL Review" : "View Document Details"}
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              icon={FileSearch}
              title="No documents found"
              copy="No documents matched your filters. Try changing your search keywords or resetting filters."
            />
          </div>
        )}
      </section>

      {/* Upload Document Modal */}
      <UploadDocumentModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUploaded={(result) => {
          if (result) {
            const list = Array.isArray(result) ? result : [result];
            saveStoredUploadedDocs(list);
            const newDocs = list.filter((item) => item.documentId).map(toOptimisticRow);
            setUploadedLocalDocs((prev) => {
              const ids = new Set(newDocs.map((n) => n.id));
              return [...newDocs, ...prev.filter((p) => !ids.has(p.id))];
            });
            setStatus("All statuses");
            setQuery("");
          }
          void poller.refresh();
        }}
      />
    </div>
  );
}
