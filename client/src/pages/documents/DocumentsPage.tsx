import { useEffect, useMemo, useState } from "react";
import type { UploadedDocInfo } from "@/components/documents/UploadDocumentModal";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSearch,
  FileText,
  Filter,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

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

function getConfidenceNumber(confStr: string): number {
  const num = parseFloat(confStr.replace("%", ""));
  return isNaN(num) ? 95 : num;
}

function toOptimisticRow(item: UploadedDocInfo) {
  const ts = item.uploadedAt || new Date().toISOString();
  return {
    id: item.documentId,
    file: item.file,
    type: item.docType || resolveUploadDocType("", item.department, item.file),
    source: `Upload · ${item.department}`,
    timestamp: formatTimestamp(ts),
    rawTimestamp: new Date(ts).getTime(),
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "highest_confidence" | "lowest_confidence">("newest");
  const [page, setPage] = useState(1);
  const pageSize = 10;

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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await poller.refresh();
      toast.success("Documents refreshed", { description: "Updated pipeline inventory from Azure." });
    } catch {
      toast.error("Failed to refresh documents");
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

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
      rawTimestamp: d.receivedAt ? new Date(d.receivedAt).getTime() : 0,
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

  const filtered = useMemo(() => {
    const rawQuery = query.toLowerCase().trim();
    const tokens = rawQuery
      .replace(/[,/\\#$%=?_]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    return allDocuments.filter((d) => {
      // 1. Search Query Matching (Multi-token + typo tolerance)
      if (tokens.length > 0) {
        const baseRow = `${d.id} ${d.file} ${d.type} ${d.source || ""} ${d.timestamp || ""} ${d.status || ""} ${d.confidence || ""} ${d.isDuplicate ? "duplicate duplicate-detected already-processed" : ""} ${d.received || ""}`
          .toLowerCase();
        const cleanRow = baseRow.replace(/[,/\\#$%=?_.-]/g, " ");
        const rowWords = cleanRow.split(/\s+/).filter(Boolean);

        const matchesTokens = tokens.every((token) => {
          if (baseRow.includes(token) || cleanRow.includes(token)) return true;
          if (token === "september" && cleanRow.includes("sep")) return true;
          if (token === "october" && cleanRow.includes("oct")) return true;
          if (token === "november" && cleanRow.includes("nov")) return true;
          if (token === "december" && cleanRow.includes("dec")) return true;

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

        if (!matchesTokens) return false;
      }

      // 2. Status Dropdown Filter
      if (statusFilter === "processed" && d.status !== "Processed") return false;
      if (statusFilter === "ivr" && d.status !== "Routed to IVR") return false;
      if (statusFilter === "duplicate" && !d.isDuplicate && d.status !== "Duplicate") return false;
      if (statusFilter === "failed" && d.status !== "Validation failed" && d.status !== "Failed") return false;
      if (statusFilter === "review" && d.status !== "Needs Review" && d.status !== "HIL Review") return false;

      // 3. Date Filter
      if (dateFilter === "today") {
        const rowDate = (d.timestamp || "").toLowerCase();
        if (!rowDate.includes("sep 21") && !rowDate.includes("today")) return false;
      }

      return true;
    });
  }, [allDocuments, query, statusFilter, dateFilter]);

  // Sorted list
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "newest") {
        return (b.rawTimestamp || 0) - (a.rawTimestamp || 0);
      }
      if (sortBy === "oldest") {
        return (a.rawTimestamp || 0) - (b.rawTimestamp || 0);
      }
      if (sortBy === "highest_confidence") {
        return getConfidenceNumber(b.confidence) - getConfidenceNumber(a.confidence);
      }
      if (sortBy === "lowest_confidence") {
        return getConfidenceNumber(a.confidence) - getConfidenceNumber(b.confidence);
      }
      return 0;
    });
  }, [filtered, sortBy]);

  // Reset pagination on filter changes
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, dateFilter, sortBy]);

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      toast.error("No documents to export", { description: "Adjust your filters to see documents." });
      return;
    }

    const headers = [
      "Document ID",
      "File Name",
      "Type",
      "Status",
      "Is Duplicate",
      "Duplicate Reason",
      "Confidence",
      "Timestamp",
      "PDF Link",
    ];

    const escapeCsv = (val: string | number | boolean | null | undefined) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const rows = filtered.map((d) => [
      escapeCsv(d.id),
      escapeCsv(d.file),
      escapeCsv(d.type),
      escapeCsv(d.status),
      escapeCsv(d.isDuplicate ? "Yes" : "No"),
      escapeCsv(d.duplicateReason || ""),
      escapeCsv(d.confidence),
      escapeCsv(d.timestamp),
      escapeCsv(d.pdfUrl ? `${origin}${d.pdfUrl}` : ""),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `pacca_documents_export_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("Export downloaded", {
      description: `Saved ${filtered.length} documents as pacca_documents_export_${dateStr}.csv`,
    });
  };

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginatedDocs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      {/* 1. TOP HEADER: INVENTORY OVERVIEW & UPLOAD */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-slate-500">Operational document inventory</div>
          <div className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-[#0e0e0e]">
            <span className="h-2 w-2 rounded-full bg-[#45bd8d]" /> Client Workspace · {filtered.length} documents
          </div>
        </div>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[11px] font-bold text-white shadow-[0_8px_18px_rgba(71,162,176,.18)] transition hover:bg-[#37828e] active:scale-[.98]"
        >
          <Upload size={15} /> Upload document
        </button>
      </div>

      {/* 2. UNIFIED CONTROLS BAR: SEARCH, DATE, COMPACT STATUS DROPDOWN, SORT, RESET */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* LEFT: PROMINENT SEARCH BAR, DATE PICKER, STATUS DROPDOWN */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* UNIFIED SEARCH BAR */}
            <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[12px] shadow-2xs focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-[12px] font-medium text-slate-800 outline-none placeholder:text-slate-400"
                placeholder="Search by file name, ID, or status..."
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </label>

            {/* DATE PICKER DROPDOWN */}
            <div className="relative flex items-center">
              <Calendar size={14} className="pointer-events-none absolute left-3 text-slate-500 z-10" />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="appearance-none h-10 rounded-xl border border-slate-200 bg-white pl-8 pr-7 text-[12px] font-semibold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 shadow-2xs"
              >
                <option value="all">Sep 21, 2026 (All)</option>
                <option value="today">Sep 21, 2026 (Today)</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
            </div>

            {/* COMPACT STATUS DROPDOWN */}
            <div className="relative flex items-center">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none h-10 rounded-xl border border-slate-200 bg-white pl-3 pr-7 text-[12px] font-semibold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 shadow-2xs"
              >
                <option value="all">Status: All statuses</option>
                <option value="processed">Status: Processed</option>
                <option value="ivr">Status: Routed to IVR</option>
                <option value="duplicate">Status: Duplicate</option>
                <option value="review">Status: Needs Review</option>
                <option value="failed">Status: Failed</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
            </div>
          </div>

          {/* RIGHT: SORT BY DROPDOWN, RESET, EXPORT */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="appearance-none h-10 rounded-xl border border-slate-200 bg-white pl-3 pr-7 text-[12px] font-semibold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 shadow-2xs"
              >
                <option value="newest">Sort by: Newest first</option>
                <option value="oldest">Sort by: Oldest first</option>
                <option value="highest_confidence">Sort by: Highest confidence</option>
                <option value="lowest_confidence">Sort by: Lowest confidence</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
            </div>

            <button
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setDateFilter("all");
                setSortBy("newest");
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 shadow-2xs"
              title="Reset all filters"
            >
              <Filter size={13} /> Reset
            </button>

            <button
              onClick={handleExportCsv}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition active:scale-[0.98]"
              title={`Export ${filtered.length} documents as CSV`}
            >
              <Download size={14} /> Export
            </button>
          </div>
        </div>
      </section>

      {/* 3. TABLE CARD: ORIGINAL PROD STYLING WITH STATUS & TAGS SPLIT */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(20,43,75,.025)]">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <SectionHeading
            title="All documents"
            eyebrow={`${filtered.length} shown · ${isLive ? "live Azure pipeline" : poller.loading ? "connecting to Azure…" : "live pipeline"}`}
          />
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-[#47a2b0] transition disabled:opacity-50"
            title="Refresh documents from pipeline"
          >
            <RefreshCw size={15} className={cn(isRefreshing && "animate-spin text-[#47a2b0]")} />
          </button>
        </div>
        {poller.error && (
          <div className="px-5 pt-4">
            <ErrorBlock error={poller.error} onRetry={() => void poller.refresh()} />
          </div>
        )}
        {poller.loading && !isLive && filtered.length === 0 && !poller.error ? (
          <div className="p-8 text-center text-[12px] font-semibold text-slate-500">
            Loading documents from Azure…
          </div>
        ) : filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  <th className="px-5 py-3 font-bold">Document</th>
                  <th className="px-3 py-3 font-bold">Document Type</th>
                  <th className="px-3 py-3 font-bold">Timestamp</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 font-bold">Tags</th>
                  <th className="px-3 py-3 font-bold">Confidence</th>
                  <th className="px-3 py-3 font-bold">Pages</th>
                  <th className="px-5 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDocs.map((doc) => {
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
                      className="cursor-pointer border-b border-slate-100 transition hover:bg-[#ebf5f7]/40"
                    >
                      {/* 1. DOCUMENT (PROD FILE ICON + NAME + ID) */}
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

                      {/* 2. DOCUMENT TYPE */}
                      <td className="px-3 py-4 text-[10px] font-medium text-slate-700">{doc.type}</td>

                      {/* 3. TIMESTAMP */}
                      <td className="px-3 py-4 text-[10px] font-mono text-slate-600 font-medium">{doc.timestamp}</td>

                      {/* 4. STATUS: DISTINCT DOT PILL */}
                      <td className="px-3 py-4">
                        <div className="inline-flex items-center gap-1.5">
                          {doc.status === "Processed" && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                              <span className="h-2 w-2 rounded-full bg-emerald-600" />
                              Processed
                            </span>
                          )}
                          {doc.status === "Routed to IVR" && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-800 ring-1 ring-blue-200">
                              <span className="h-2 w-2 rounded-full bg-blue-600" />
                              Routed to IVR
                            </span>
                          )}
                          {(doc.status === "Needs Review" || doc.status === "HIL Review") && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200">
                              <span className="h-2 w-2 rounded-full bg-amber-500" />
                              Needs Review
                            </span>
                          )}
                          {(doc.status === "Validation failed" || doc.status === "Failed") && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-800 ring-1 ring-rose-200">
                              <span className="h-2 w-2 rounded-full bg-rose-600" />
                              Failed
                            </span>
                          )}
                          {(doc.status === "Queued" || doc.status === "Processing") && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-800 ring-1 ring-sky-200">
                              <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
                              {doc.status}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. TAGS: SEPARATE COLUMN, ONLY SHOWS DUPLICATE PILL OR DASH */}
                      <td className="px-3 py-4">
                        {doc.isDuplicate ? (
                          <span
                            title={doc.duplicateReason || `Duplicate of ${doc.duplicateOf}`}
                            className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-700 ring-1 ring-purple-200"
                          >
                            Duplicate
                          </span>
                        ) : (
                          <span className="text-[12px] text-slate-300">—</span>
                        )}
                      </td>

                      {/* 6. CONFIDENCE (PROD TEXT STYLING) */}
                      <td className="px-3 py-4 text-[10px] text-slate-600 font-semibold">{doc.confidence}</td>

                      {/* 7. PAGES */}
                      <td className="px-3 py-4 text-[10px] text-slate-500">{doc.pages}</td>

                      {/* 8. ACTION */}
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpen();
                          }}
                          className="rounded-lg p-2 text-slate-400 hover:bg-[#ebf5f7] hover:text-[#47a2b0]"
                          title={needsReview ? "Open in HIL Review" : "View Document Details"}
                        >
                          <Eye size={15} />
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

        {/* 4. PAGINATION: EXACT BOTTOM < 1 2 3 ... > NAVIGATION */}
        {sorted.length > 0 && (
          <div className="flex flex-wrap items-center justify-between border-t border-slate-100 px-5 py-3.5 text-[12px] text-slate-500">
            <div>
              Showing <span className="font-bold text-slate-700">{(page - 1) * pageSize + 1}</span>-
              <span className="font-bold text-slate-700">{Math.min(page * pageSize, sorted.length)}</span> of{" "}
              <span className="font-bold text-slate-700">{sorted.length}</span> results
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous page"
              >
                <ChevronLeft size={15} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(0, 5)
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[12px] font-bold transition",
                      p === page
                        ? "border border-blue-600 bg-blue-50 text-blue-700"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {p}
                  </button>
                ))}

              {totalPages > 5 && (
                <>
                  <span className="px-1 text-slate-400">…</span>
                  <button
                    onClick={() => setPage(totalPages)}
                    className={cn(
                      "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[12px] font-bold transition",
                      totalPages === page
                        ? "border border-blue-600 bg-blue-50 text-blue-700"
                        : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {totalPages}
                  </button>
                </>
              )}

              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
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
            setStatusFilter("all");
            setQuery("");
          }
          void poller.refresh();
        }}
      />
    </div>
  );
}
