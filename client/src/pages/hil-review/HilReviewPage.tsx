import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Lock,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Unlock,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchDocument,
  fetchDocuments,
  humanize,
  percent,
  postReview,
  relativeTime,
  REASON_LABEL,
  usePolled,
  type ExtractedField,
} from "@/senderra/api";
import { hilQueue, type HilItem } from "@/data/mockData";

function formatFieldValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    if (Array.isArray(val)) {
      return val.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
    }
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.every(([, v]) => typeof v !== "object")) {
      return entries.map(([, v]) => v).filter(Boolean).join(", ");
    }
    return JSON.stringify(val);
  }
  return String(val);
}

/** Formats cryptic GUID or temporary upload filenames into clean titles for staff */
function formatDocumentLabel(filename: string, docType?: string | null): string {
  const cleanType = docType ? humanize(docType) : "Prior Authorization";
  // If file starts with GUID like dbd0538a-17a2...
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(filename)) {
    const shortId = filename.substring(0, 8).toUpperCase();
    return `${cleanType} · Batch #${shortId}`;
  }
  // If file is generic like temp10_... or pacca_upload_test
  if (/^temp\d+_/i.test(filename) || /^pacca_upload_/i.test(filename)) {
    const match = filename.match(/_(.+)\.pdf$/i) || filename.match(/^([^_]+)/);
    const label = match ? match[1].replace(/[-_]+/g, " ") : filename;
    return `${cleanType} · ${humanize(label)}`;
  }
  // Standard filename like RX-0003_Denise_Carver.pdf
  return `${filename.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ")} (${cleanType})`;
}

export default function HilReviewPage({
  userEmail = "reviewer@emids.com",
  userName = "Reviewer",
  focusDocumentId,
}: {
  userEmail?: string;
  userName?: string;
  focusDocumentId?: string | null;
}) {
  // Live polling for real pipeline documents awaiting human review
  const queuePoller = usePolled(() => fetchDocuments({ needsReview: "true" }), 6000);
  const liveDocuments = queuePoller.data?.documents ?? [];
  const isLiveConnected = liveDocuments.length > 0;

  // Selected document ID
  const [selectedId, setSelectedId] = useState<string | null>(focusDocumentId ?? null);

  // Sync selectedId when live documents load or focusDocumentId changes
  useEffect(() => {
    if (focusDocumentId) {
      setSelectedId(focusDocumentId);
    } else if (isLiveConnected && (!selectedId || !liveDocuments.some((d) => d.documentId === selectedId))) {
      setSelectedId(liveDocuments[0].documentId);
    }
  }, [focusDocumentId, isLiveConnected, liveDocuments, selectedId]);

  // Fallback queue state
  const [mockList, setMockList] = useState<HilItem[]>(hilQueue);
  const [mockIndex, setMockIndex] = useState(() => {
    if (focusDocumentId) {
      const idx = hilQueue.findIndex((d) => d.id === focusDocumentId);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });

  const isLiveDoc = isLiveConnected && selectedId !== null;

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      {/* Top Review Control Strip */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#47a2b0]">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isLiveConnected ? "animate-pulse bg-emerald-500" : "bg-[#f2c94c]"
              )}
            />
            {isLiveConnected ? "Live Pipeline Review Queue" : "Client Operations Review Queue"} · Human-in-the-Loop
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
              Human in the Loop Review
            </h2>
            <span className="rounded-full bg-[#f2c94c]/20 px-2.5 py-0.5 text-[11px] font-bold text-[#b7860b]">
              {isLiveConnected ? liveDocuments.length : mockList.filter((d) => d.status === "Needs Review").length} awaiting decision
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Only documents with missing required fields or low-confidence exceptions require human intervention.
          </p>
        </div>

        {/* Document Navigation & Quick Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {isLiveConnected ? (
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                onClick={() => {
                  const currIdx = liveDocuments.findIndex((d) => d.documentId === selectedId);
                  if (currIdx > 0) setSelectedId(liveDocuments[currIdx - 1].documentId);
                }}
                disabled={liveDocuments.findIndex((d) => d.documentId === selectedId) <= 0}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                title="Previous document"
              >
                <ChevronLeft size={16} />
              </button>
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="max-w-[340px] truncate bg-transparent px-2 py-1 text-[11px] font-bold text-[#0e0e0e] outline-none cursor-pointer"
              >
                {liveDocuments.map((doc, idx) => (
                  <option key={doc.documentId} value={doc.documentId}>
                    {idx + 1}. {formatDocumentLabel(doc.file, doc.docType)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const currIdx = liveDocuments.findIndex((d) => d.documentId === selectedId);
                  if (currIdx >= 0 && currIdx < liveDocuments.length - 1) {
                    setSelectedId(liveDocuments[currIdx + 1].documentId);
                  }
                }}
                disabled={liveDocuments.findIndex((d) => d.documentId === selectedId) >= liveDocuments.length - 1}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                title="Next document"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                onClick={() => setMockIndex((prev) => Math.max(0, prev - 1))}
                disabled={mockIndex === 0}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                title="Previous document"
              >
                <ChevronLeft size={16} />
              </button>
              <select
                value={mockIndex}
                onChange={(e) => setMockIndex(Number(e.target.value))}
                className="max-w-[280px] truncate bg-transparent px-2 py-1 text-[11px] font-bold text-[#0e0e0e] outline-none"
              >
                {mockList.map((doc, idx) => (
                  <option key={doc.id} value={idx}>
                    {idx + 1}. {doc.patientOrVendor} ({doc.docType}) {doc.status === "Approved" ? "✓" : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setMockIndex((prev) => Math.min(mockList.length - 1, prev + 1))}
                disabled={mockIndex === mockList.length - 1}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                title="Next document"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void queuePoller.refresh()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition"
            title="Refresh queue"
          >
            <RefreshCw size={13} className={queuePoller.loading ? "animate-spin text-[#47a2b0]" : "text-slate-400"} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 shadow-sm sm:flex">
            <UserCheck size={14} className="text-[#47a2b0]" />
            <span>Reviewer: <strong>{userName}</strong></span>
          </div>
        </div>
      </div>

      {/* Main Workbench Body */}
      {isLiveDoc && selectedId ? (
        <LiveWorkbench
          key={selectedId}
          documentId={selectedId}
          reviewer={userEmail || userName}
          reviewerName={userName}
          onResolved={() => {
            void queuePoller.refresh();
            const currIdx = liveDocuments.findIndex((d) => d.documentId === selectedId);
            if (currIdx >= 0 && currIdx < liveDocuments.length - 1) {
              setSelectedId(liveDocuments[currIdx + 1].documentId);
            } else if (liveDocuments.length > 1) {
              setSelectedId(liveDocuments[0].documentId);
            } else {
              setSelectedId(null);
            }
          }}
        />
      ) : (
        <StandardWorkbench
          currentDoc={mockList[mockIndex] ?? mockList[0]}
          userName={userName}
          onSaveDoc={(updated) => {
            setMockList((prev) => prev.map((d, i) => (i === mockIndex ? updated : d)));
          }}
          onAdvance={() => {
            const nextIdx = mockList.findIndex((d, i) => i !== mockIndex && d.status !== "Approved");
            if (nextIdx >= 0) setMockIndex(nextIdx);
          }}
        />
      )}
    </div>
  );
}

/**
 * Workbench with real PDF viewer and smart STP field locking
 */
function StandardWorkbench({
  currentDoc,
  userName,
  onSaveDoc,
  onAdvance,
}: {
  currentDoc: HilItem;
  userName: string;
  onSaveDoc: (updated: HilItem) => void;
  onAdvance: () => void;
}) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentDoc) {
      const map: Record<string, string> = {};
      currentDoc.fields.forEach((f) => {
        map[f.key] = f.value;
      });
      setFieldValues(map);
      setDirtyFields(new Set());
      setUnlockedFields(new Set());
    }
  }, [currentDoc?.id]);

  const handleFieldChange = (key: string, val: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: val }));
    setDirtyFields((prev) => new Set(prev).add(key));
  };

  const handleCancelEdits = () => {
    if (!currentDoc) return;
    const map: Record<string, string> = {};
    currentDoc.fields.forEach((f) => {
      map[f.key] = f.value;
    });
    setFieldValues(map);
    setDirtyFields(new Set());
    toast("Changes discarded", { description: "Restored extracted values." });
  };

  const handleSaveChanges = () => {
    if (!currentDoc) return;
    onSaveDoc({
      ...currentDoc,
      fields: currentDoc.fields.map((f) => ({
        ...f,
        value: fieldValues[f.key] ?? f.value,
        flagged: f.flagged ? false : f.flagged,
      })),
    });
    setDirtyFields(new Set());
    toast.success("Changes saved", {
      description: `Updated ${dirtyFields.size} field(s) for ${currentDoc.patientOrVendor}.`,
    });
  };

  const handleApprove = () => {
    if (!currentDoc) return;
    onSaveDoc({ ...currentDoc, status: "Approved" });
    toast.success("Document approved & delivered", {
      description: `${currentDoc.patientOrVendor} validated successfully. Moving to next in queue.`,
    });
    onAdvance();
  };

  const handleReject = () => {
    if (!currentDoc) return;
    onSaveDoc({ ...currentDoc, status: "Rejected" });
    toast.error("Document rejected / flagged", {
      description: `${currentDoc.patientOrVendor} returned to triage for supervisor exception handling.`,
    });
    onAdvance();
  };

  const toggleUnlock = (key: string) => {
    setUnlockedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Split fields into problem fields vs verified STP fields
  const flaggedFields = currentDoc.fields.filter((f) => f.flagged || f.confidence < 75 || !f.value);
  const verifiedFields = currentDoc.fields.filter((f) => !f.flagged && f.confidence >= 75 && f.value);

  const pdfUrl = currentDoc.pdfUrl || "/pdfs/invoice_001.pdf";

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Card: REAL Source PDF Preview */}
      <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(20,43,75,.025)] lg:col-span-6">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[15px] font-bold text-[#0e0e0e]">
              Source Document
            </h3>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600">
              {currentDoc.file}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
              {currentDoc.pages} {currentDoc.pages === 1 ? "page" : "pages"}
            </span>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#47a2b0] hover:text-[#37828e]"
              title="Open source PDF in new browser tab"
            >
              <ExternalLink size={12} /> Open PDF
            </a>
          </div>
        </div>

        {/* Real PDF Iframe with Full Scroll and Zoom */}
        <div className="relative flex min-h-[640px] flex-1 flex-col overflow-hidden bg-slate-100 p-3 sm:p-4">
          <iframe
            src={pdfUrl}
            title={`Source document ${currentDoc.file}`}
            className="h-full min-h-[620px] w-full rounded-xl border border-slate-200 bg-white shadow-xs"
          />
        </div>
      </section>

      {/* Right Card: Details & Smart Extracted Fields */}
      <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6 lg:col-span-6">
        <div className="border-b border-slate-100 pb-5">
          <h3 className="font-display text-[16px] font-bold text-[#0e0e0e]">
            Document Details
          </h3>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                CONFIDENCE
              </div>
              <div className={cn("mt-1 flex items-center gap-1 text-[16px] font-bold", currentDoc.confidence >= 80 ? "text-[#45bd8d]" : "text-[#f2c94c]")}>
                {currentDoc.confidence}%
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                PAGES
              </div>
              <div className="mt-1 text-[16px] font-bold text-[#0e0e0e]">
                {currentDoc.pages}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                UPLOADED BY
              </div>
              <div className="mt-1 truncate text-[12px] font-semibold text-[#0e0e0e]" title={currentDoc.uploadedBy}>
                {currentDoc.uploadedBy}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                UPLOADED
              </div>
              <div className="mt-1 text-[12px] font-semibold text-[#0e0e0e]">
                {currentDoc.uploadedAt}
              </div>
            </div>
          </div>
        </div>

        {/* Extracted Fields Section */}
        <div className="mt-5 flex-1 space-y-6">
          {/* Action Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h4 className="font-display text-[14px] font-bold text-[#0e0e0e]">
                Extracted Fields
              </h4>
              <p className="text-[10px] text-slate-400">
                {flaggedFields.length} field{flaggedFields.length === 1 ? "" : "s"} require review · {verifiedFields.length} verified by pipeline
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelEdits}
                disabled={dirtyFields.size === 0}
                className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={dirtyFields.size === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0e3d36] px-3.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#092b26] disabled:opacity-40"
              >
                <Save size={13} /> Save changes
              </button>
            </div>
          </div>

          {/* Group 1: Fields Needing Review (Editable) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-bold text-amber-700">
              <AlertTriangle size={14} />
              <span>Fields Needing Human Review ({flaggedFields.length})</span>
            </div>

            {flaggedFields.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-[11px] text-emerald-800">
                All fields passed automated validation. No hard review flags remaining.
              </div>
            ) : (
              <div className="space-y-2.5">
                {flaggedFields.map((field) => {
                  const isDirty = dirtyFields.has(field.key);
                  const curVal = fieldValues[field.key] ?? field.value;

                  return (
                    <div
                      key={field.key}
                      className={cn(
                        "rounded-xl border p-3 transition",
                        isDirty
                          ? "border-[#47a2b0] bg-[#47a2b0]/5"
                          : "border-amber-200 bg-amber-50/40"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-[#0e0e0e]" htmlFor={`flagged-${field.key}`}>
                          {field.name}
                        </label>
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100/80 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                          <AlertTriangle size={10} />
                          {field.confidence === 0 ? "Missing Required Field" : `Low Confidence (${field.confidence}%)`}
                        </span>
                      </div>

                      <div className="relative mt-2">
                        <input
                          id={`flagged-${field.key}`}
                          value={curVal}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          placeholder="Enter verified value from document..."
                          className={cn(
                            "w-full rounded-lg border bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0e0e0e] outline-none transition",
                            isDirty
                              ? "border-[#47a2b0] ring-1 ring-[#47a2b0]"
                              : "border-amber-300 focus:border-[#47a2b0]"
                          )}
                        />
                        {isDirty && (
                          <span className="absolute -top-2 right-2 rounded-full bg-[#47a2b0] px-1.5 py-0.2 text-[8px] font-bold text-white shadow-xs">
                            Modified
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Group 2: Verified Fields (Locked / Read-Only STP) */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                <CheckCircle2 size={14} className="text-[#45bd8d]" />
                <span>Verified Fields · Straight-Through Processed ({verifiedFields.length})</span>
              </div>
              <span className="text-[10px] text-slate-400">Locked to prevent accidental changes</span>
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
              {verifiedFields.map((field) => {
                const isUnlocked = unlockedFields.has(field.key);
                const curVal = fieldValues[field.key] ?? field.value;
                const isDirty = dirtyFields.has(field.key);

                return (
                  <div key={field.key} className="flex items-center justify-between gap-3 p-3 text-[11px]">
                    <div className="flex items-center gap-2 sm:w-1/3">
                      <span className="font-medium text-slate-600">{field.name}</span>
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50">
                        <Check size={9} /> Valid ({field.confidence}%)
                      </span>
                    </div>

                    <div className="flex flex-1 items-center justify-end gap-2 text-right">
                      {isUnlocked ? (
                        <input
                          value={curVal}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          className={cn(
                            "w-full max-w-[280px] rounded-lg border bg-white px-2 py-1 text-right text-[11px] font-semibold outline-none",
                            isDirty ? "border-[#47a2b0]" : "border-slate-300"
                          )}
                        />
                      ) : (
                        <span className="font-semibold text-[#0e0e0e] truncate max-w-[280px]">
                          {curVal || "—"}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleUnlock(field.key)}
                        title={isUnlocked ? "Lock field" : "Unlock field to override"}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      >
                        {isUnlocked ? <Lock size={12} className="text-amber-600" /> : <Pencil size={12} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Review Decision Actions */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={handleReject}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
          >
            <XCircle size={14} /> Reject / Escalate
          </button>

          <div className="flex w-full sm:w-auto items-center gap-2">
            <button
              type="button"
              onClick={() => toast("Reprocessing triggered", { description: "Sending document to extraction stage." })}
              className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              <RefreshCw size={13} /> Reprocess
            </button>

            <button
              type="button"
              onClick={handleApprove}
              className={cn(
                "inline-flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[11px] font-bold text-white shadow-[0_4px_14px_rgba(69,189,141,0.25)] transition",
                currentDoc.status === "Approved"
                  ? "bg-[#45bd8d]"
                  : "bg-[#45bd8d] hover:bg-[#39a87d]"
              )}
            >
              <CheckCircle2 size={15} />
              {currentDoc.status === "Approved" ? "Approved" : "Approve & deliver"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Live Workbench: connected to live backend API when Cosmos credentials are configured
 */
function LiveWorkbench({
  documentId,
  reviewer,
  reviewerName,
  onResolved,
}: {
  documentId: string;
  reviewer: string;
  reviewerName: string;
  onResolved: () => void;
}) {
  const { data, error, loading, refresh } = usePolled(() => fetchDocument(documentId), 4000, [documentId]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "save" | "approve" | "reject" | "claim">(null);

  const toggleUnlock = (key: string) => {
    setUnlockedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const fieldEntries = useMemo(() => Object.entries(data?.fields?.fields ?? {}), [data]);

  const currentValue = (name: string, field: ExtractedField): string => {
    if (name in drafts) return drafts[name];
    const correction = data?.review?.corrections?.[name];
    if (correction) return formatFieldValue(correction.value);
    return formatFieldValue(field.value);
  };

  const originalValue = (name: string, field: ExtractedField): string => {
    return formatFieldValue(field.value);
  };

  const changed = useMemo(() => {
    if (!data) return [] as { name: string; from: string; to: string }[];
    return Object.entries(drafts)
      .map(([name, value]) => {
        const field = data.fields?.fields?.[name];
        if (!field) return null;
        const from = originalValue(name, field);
        if (from === value) return null;
        return { name, from, to: value };
      })
      .filter((entry): entry is { name: string; from: string; to: string } => entry !== null);
  }, [drafts, data]);

  const act = async (action: "claim" | "correct" | "approve" | "reject") => {
    setBusy(action === "correct" ? "save" : action);
    try {
      const corrections =
        changed.length > 0
          ? Object.fromEntries(changed.map((entry) => [entry.name, entry.to]))
          : undefined;

      await postReview({
        documentId,
        action,
        by: reviewer,
        note: note.trim() || null,
        ...(action === "approve" || action === "correct" ? { corrections } : {}),
      });

      if (action === "claim") {
        toast.success("Document claimed", { description: `Assigned to ${reviewerName}` });
      }
      if (action === "correct") {
        toast.success(`${changed.length} correction${changed.length === 1 ? "" : "s"} saved`);
      }
      if (action === "approve") {
        toast.success("Approved & delivered to downstream pipeline");
        onResolved();
        return;
      }
      if (action === "reject") {
        toast.error("Document rejected / routed for reprocessing");
        onResolved();
        return;
      }

      setDrafts({});
      await refresh();
    } catch (err) {
      toast.error("Review action failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-8">
        <RefreshCw size={24} className="animate-spin text-[#47a2b0]" />
        <span className="mt-3 text-sm font-semibold text-slate-600">Loading document {documentId}…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 text-rose-600 shrink-0" />
          <div>
            <h4 className="font-display text-sm font-bold text-rose-900">Failed to load live document</h4>
            <p className="mt-1 text-xs text-rose-700 leading-relaxed">{error ?? "Document detail unavailable"}</p>
          </div>
        </div>
      </div>
    );
  }

  const { summary, pdfUrl } = data;
  const flagged = fieldEntries.filter(([, f]) => f.needs_review || (typeof f.scores?.field_score === "number" && f.scores.field_score < 0.8));
  const verified = fieldEntries.filter(([, f]) => !f.needs_review && (typeof f.scores?.field_score !== "number" || f.scores.field_score >= 0.8));

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Card: Source PDF */}
      <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(20,43,75,.025)] lg:col-span-6">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[15px] font-bold text-[#0e0e0e]">
              Source Document
            </h3>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700" title={summary.file}>
              {formatDocumentLabel(summary.file, summary.docType)}
            </span>
          </div>
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#47a2b0] hover:text-[#37828e]"
            >
              <ExternalLink size={12} /> Open PDF
            </a>
          )}
        </div>

        <div className="relative flex min-h-[640px] flex-1 flex-col overflow-hidden bg-slate-100 p-3 sm:p-4">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              title={`Source PDF for ${summary.file}`}
              className="h-full min-h-[620px] w-full rounded-xl border border-slate-200 bg-white shadow-xs"
            />
          ) : (
            <div className="flex min-h-[620px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
              <FileText size={28} className="text-slate-300" />
              <div className="mt-2 text-xs font-bold text-slate-700">Source PDF streaming</div>
            </div>
          )}
        </div>
      </section>

      {/* Right Card: Details & Fields */}
      <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6 lg:col-span-6">
        <div className="border-b border-slate-100 pb-5">
          <h3 className="font-display text-[16px] font-bold text-[#0e0e0e]">
            Document Details
          </h3>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                CONFIDENCE
              </div>
              <div className="mt-1 flex items-center gap-1 text-[16px] font-bold text-[#45bd8d]">
                {percent(summary.confidence, 1)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                PAGES
              </div>
              <div className="mt-1 text-[16px] font-bold text-[#0e0e0e]">
                {summary.pages ?? 1}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                UPLOADED BY
              </div>
              <div className="mt-1 truncate text-[12px] font-semibold text-[#0e0e0e]">
                {summary.source ?? "Auto-intake"}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                UPLOADED
              </div>
              <div className="mt-1 text-[12px] font-semibold text-[#0e0e0e]">
                {relativeTime(summary.receivedAt)}
              </div>
            </div>
          </div>
        </div>

        {/* Fields list */}
        <div className="mt-5 flex-1 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="font-display text-[14px] font-bold text-[#0e0e0e]">
              Extracted Fields
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDrafts({})}
                disabled={changed.length === 0}
                className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void act("correct")}
                disabled={busy !== null || changed.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0e3d36] px-3.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#092b26] disabled:opacity-40"
              >
                <Save size={13} /> {changed.length > 0 ? `Save (${changed.length})` : "Save changes"}
              </button>
            </div>
          </div>

          {/* Group 1: Fields Needing Review (Editable) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-bold text-amber-700">
              <AlertTriangle size={14} />
              <span>Fields Needing Human Review ({flagged.length})</span>
            </div>

            <div className="space-y-2.5">
              {flagged.map(([name, field]) => {
                const curVal = currentValue(name, field);
                const origVal = originalValue(name, field);
                const isDirty = curVal !== origVal;

                return (
                  <div key={name} className={cn("rounded-xl border p-3", isDirty ? "border-[#47a2b0] bg-[#47a2b0]/5" : "border-amber-200 bg-amber-50/40")}>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-[#0e0e0e]" htmlFor={`live-flagged-${name}`}>
                        {humanize(name)}
                      </label>
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100/80 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                        <AlertTriangle size={10} /> Review Required
                      </span>
                    </div>

                    <div className="relative mt-2">
                      <input
                        id={`live-flagged-${name}`}
                        value={curVal}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [name]: e.target.value }))}
                        className={cn(
                          "w-full rounded-lg border bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0e0e0e] outline-none transition",
                          isDirty ? "border-[#47a2b0] ring-1 ring-[#47a2b0]" : "border-amber-300 focus:border-[#47a2b0]"
                        )}
                      />
                      {isDirty && (
                        <span className="absolute -top-2 right-2 rounded-full bg-[#47a2b0] px-1.5 py-0.2 text-[8px] font-bold text-white shadow-xs">
                          Modified
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group 2: Verified Fields (Read-Only) */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                <CheckCircle2 size={14} className="text-[#45bd8d]" />
                <span>Verified Fields · Straight-Through Processed ({verified.length})</span>
              </div>
              <span className="text-[10px] text-slate-400">Locked</span>
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
              {verified.map(([name, field]) => {
                const isUnlocked = unlockedFields.has(name);
                const curVal = currentValue(name, field);
                const origVal = originalValue(name, field);
                const isDirty = curVal !== origVal;

                return (
                  <div key={name} className="flex items-center justify-between gap-3 p-3 text-[11px]">
                    <div className="flex items-center gap-2 sm:w-1/3">
                      <span className="font-medium text-slate-600">{humanize(name)}</span>
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50">
                        <Check size={9} /> Valid
                      </span>
                    </div>

                    <div className="flex flex-1 items-center justify-end gap-2 text-right">
                      {isUnlocked ? (
                        <input
                          value={curVal}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [name]: e.target.value }))}
                          className={cn(
                            "w-full max-w-[280px] rounded-lg border bg-white px-2 py-1 text-right text-[11px] font-semibold outline-none",
                            isDirty ? "border-[#47a2b0] ring-1 ring-[#47a2b0]" : "border-slate-300"
                          )}
                        />
                      ) : (
                        <span className="font-semibold text-[#0e0e0e] truncate max-w-[280px]">
                          {curVal || "—"}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleUnlock(name)}
                        title={isUnlocked ? "Lock field" : "Unlock field to edit"}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                      >
                        {isUnlocked ? <Lock size={12} className="text-amber-600" /> : <Pencil size={12} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Review Decision Actions */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={() => void act("reject")}
            disabled={busy !== null}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
          >
            <XCircle size={14} /> Reject / Escalate
          </button>

          <div className="flex w-full sm:w-auto items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy !== null}
              className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
            >
              <RefreshCw size={13} /> Reprocess
            </button>

            <button
              type="button"
              onClick={() => void act("approve")}
              disabled={busy !== null}
              className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl bg-[#45bd8d] px-5 py-2.5 text-[11px] font-bold text-white shadow-[0_4px_14px_rgba(69,189,141,0.25)] hover:bg-[#39a87d] transition disabled:opacity-50"
            >
              <CheckCircle2 size={15} /> Approve &amp; deliver
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
