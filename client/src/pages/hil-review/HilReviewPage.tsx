import { memo, useEffect, useMemo, useState } from "react";
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
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchDocument,
  fetchDocuments,
  formatFieldValue,
  humanize,
  percent,
  postReview,
  relativeTime,
  usePolled,
  type ExtractedField,
} from "@/senderra/api";
import { hilQueue, type HilItem } from "@/data/mockData";

/**
 * Isolated, strictly memoized PDF Viewer.
 *
 * Prevents Chrome's embedded PDF viewer from re-rendering and flickering
 * on every polling cycle or form input keystroke.
 *
 * Parameters added:
 * - navpanes=0: Hides Chrome's left thumbnails sidebar (removes squished, off-center document)
 * - toolbar=0: Hides Chrome's native PDF top toolbar (removes Chrome's AI 'Summarize' button)
 * - view=FitH: Fits the PDF width comfortably to container
 */
const MemoizedPdfViewer = memo(
  function MemoizedPdfViewer({ url, title }: { url: string; title: string }) {
    const stableUrl = useMemo(() => {
      if (!url) return "";
      const clean = url.split("#")[0];
      return `${clean}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
    }, [url]);

    if (!url) {
      return (
        <div className="flex h-full min-h-[640px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
          <FileText size={32} className="text-slate-300" />
          <div className="mt-2 text-xs font-bold text-slate-700">Source PDF not available</div>
        </div>
      );
    }

    return (
      <iframe
        src={stableUrl}
        title={title}
        className="h-full min-h-[720px] lg:min-h-[820px] w-full rounded-xl border border-slate-200 bg-white shadow-xs"
      />
    );
  },
  (prevProps, nextProps) => {
    return prevProps.url === nextProps.url && prevProps.title === nextProps.title;
  }
);

/** Formats cryptic GUID or temporary upload filenames into clean titles for staff */
function formatDocumentLabel(filename: string, docType?: string | null): string {
  const cleanType = docType ? humanize(docType) : "Prior Authorization";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(filename)) {
    const shortId = filename.substring(0, 8).toUpperCase();
    return `${cleanType} · Batch #${shortId}`;
  }
  if (/^temp\d+_/i.test(filename) || /^pacca_upload_/i.test(filename)) {
    const match = filename.match(/_(.+)\.pdf$/i) || filename.match(/^([^_]+)/);
    const label = match ? match[1].replace(/[-_]+/g, " ") : filename;
    return `${cleanType} · ${humanize(label)}`;
  }
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
  const queuePoller = usePolled(() => fetchDocuments({ needsReview: "true" }), 8000);
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
            {isLiveConnected ? "Live Pipeline Review Queue" : "Operations Review Queue"} · Human-in-the-Loop
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

      {/* Main Workbench Body: 75% PDF Left, 25% Sidebar Right */}
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
 * Standard Workbench (Fallback & Mock Queue):
 * 75% PDF Viewer on left, 25% Field populated sidebar on right.
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

  const flaggedFields = currentDoc.fields.filter((f) => f.flagged || f.confidence < 75 || !f.value);
  const verifiedFields = currentDoc.fields.filter((f) => !f.flagged && f.confidence >= 75 && f.value);
  const pdfUrl = currentDoc.pdfUrl || "/pdfs/invoice_001.pdf";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Left Card: 70-75% PDF Viewer */}
      <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden min-w-0">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[15px] font-bold text-[#0e0e0e]">
              Source Document
            </h3>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 truncate max-w-[280px]">
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

        {/* Stable Memoized PDF Iframe */}
        <div className="relative flex flex-1 flex-col overflow-hidden bg-slate-100 p-3 sm:p-4 min-h-[720px] lg:min-h-[820px]">
          <MemoizedPdfViewer url={pdfUrl} title={`Source document ${currentDoc.file}`} />
        </div>
      </section>

      {/* Right Card: 25-30% Sleek Field Verification Sidebar */}
      <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs min-w-0">
        {/* Document Quick Metadata Strip */}
        <div className="border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Document Review</span>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold",
                currentDoc.confidence >= 80 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              )}
            >
              {currentDoc.confidence}% Confidence
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
            <span>Pages: <strong>{currentDoc.pages}</strong></span>
            <span>Source: <strong>{currentDoc.uploadedBy}</strong></span>
          </div>
        </div>

        {/* Extracted Fields Form */}
        <div className="mt-4 flex-1 space-y-5 overflow-y-auto">
          {/* Header & Save/Cancel for edits */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h4 className="font-display text-[13px] font-bold text-[#0e0e0e]">
                Extracted Fields
              </h4>
              <p className="text-[9px] text-slate-400">
                {flaggedFields.length} require review · {verifiedFields.length} STP verified
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {dirtyFields.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleCancelEdits}
                    className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0e3d36] px-3 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-[#092b26] transition"
                  >
                    <Save size={11} /> Save
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Group 1: Fields Needing Human Review */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              <AlertTriangle size={12} />
              <span>Review Required ({flaggedFields.length})</span>
            </div>

            {flaggedFields.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5 text-[10px] text-emerald-800">
                ✓ All fields passed automated checks.
              </div>
            ) : (
              <div className="space-y-2">
                {flaggedFields.map((field) => {
                  const isDirty = dirtyFields.has(field.key);
                  const curVal = fieldValues[field.key] ?? field.value;

                  return (
                    <div
                      key={field.key}
                      className={cn(
                        "rounded-xl border p-2.5 transition",
                        isDirty
                          ? "border-[#47a2b0] bg-[#47a2b0]/5 ring-1 ring-[#47a2b0]/30"
                          : "border-amber-200 bg-amber-50/30"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-[#0e0e0e]" htmlFor={`flagged-${field.key}`}>
                          {field.name}
                        </label>
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold text-amber-800">
                          {field.confidence === 0 ? "Missing" : `${field.confidence}%`}
                        </span>
                      </div>

                      <div className="relative mt-1.5">
                        <input
                          id={`flagged-${field.key}`}
                          value={curVal}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          placeholder="Enter verified value..."
                          className={cn(
                            "w-full rounded-lg border bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0e0e0e] outline-none transition",
                            isDirty ? "border-[#47a2b0]" : "border-amber-300 focus:border-[#47a2b0]"
                          )}
                        />
                        {isDirty && (
                          <span className="absolute -top-2 right-2 rounded-full bg-[#47a2b0] px-1.5 text-[7px] font-bold text-white shadow-xs">
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

          {/* Group 2: STP Verified Fields (Read-Only with Optional Unlock) */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-[#45bd8d]" />
                <span>Verified Fields ({verifiedFields.length})</span>
              </div>
              <span className="text-[8px] text-slate-400">Locked</span>
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
              {verifiedFields.map((field) => {
                const isUnlocked = unlockedFields.has(field.key);
                const curVal = fieldValues[field.key] ?? field.value;
                const isDirty = dirtyFields.has(field.key);

                return (
                  <div key={field.key} className="flex items-center justify-between gap-2 p-2 text-[10px]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-600">{field.name}</div>
                    </div>

                    <div className="flex items-center gap-1.5 text-right">
                      {isUnlocked ? (
                        <input
                          value={curVal}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          className={cn(
                            "w-28 rounded border bg-white px-1.5 py-0.5 text-right text-[10px] font-semibold outline-none",
                            isDirty ? "border-[#47a2b0]" : "border-slate-300"
                          )}
                        />
                      ) : (
                        <span className="truncate font-semibold text-[#0e0e0e] max-w-[120px]">
                          {curVal || "—"}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleUnlock(field.key)}
                        title={isUnlocked ? "Lock field" : "Unlock to override"}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                      >
                        {isUnlocked ? <Lock size={10} className="text-amber-600" /> : <Pencil size={10} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pinned Action Controls */}
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={handleApprove}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] font-bold text-white shadow-sm transition",
              currentDoc.status === "Approved" ? "bg-[#45bd8d]" : "bg-[#45bd8d] hover:bg-[#39a87d]"
            )}
          >
            <CheckCircle2 size={14} />
            {currentDoc.status === "Approved" ? "Approved" : "Approve & deliver"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toast("Reprocessing requested")}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              <RefreshCw size={11} /> Reprocess
            </button>
            <button
              type="button"
              onClick={handleReject}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50/70 py-2 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition"
            >
              <XCircle size={11} /> Reject
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Live Workbench: connected to live backend API.
 * 75% PDF Viewer on left with memoized iframe, 25% Field populated sidebar on right.
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
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "save" | "approve" | "reject">(null);

  // Poll only when there are NO unsaved draft edits to prevent overwriting active typing
  const pollInterval = Object.keys(drafts).length > 0 ? null : 12000;
  const { data, error, loading, refresh } = usePolled(() => fetchDocument(documentId), pollInterval, [documentId]);

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

  const act = async (action: "correct" | "approve" | "reject") => {
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

      if (action === "correct") {
        toast.success(`${changed.length} correction${changed.length === 1 ? "" : "s"} saved`);
      }
      if (action === "approve") {
        toast.success("Approved & delivered to downstream pipeline");
        onResolved();
        return;
      }
      if (action === "reject") {
        toast.error("Document rejected / routed for triage");
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
  const flagged = fieldEntries.filter(
    ([, f]) => f.needs_review || (typeof f.scores?.field_score === "number" && f.scores.field_score < 0.8)
  );
  const verified = fieldEntries.filter(
    ([, f]) => !f.needs_review && (typeof f.scores?.field_score !== "number" || f.scores.field_score >= 0.8)
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Left Card: 70-75% PDF Viewer with Stable Memoized Rendering */}
      <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden min-w-0">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[15px] font-bold text-[#0e0e0e]">
              Source Document
            </h3>
            <span
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 truncate max-w-[280px]"
              title={summary.file}
            >
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

        {/* Stable Memoized PDF Container */}
        <div className="relative flex flex-1 flex-col overflow-hidden bg-slate-100 p-3 sm:p-4 min-h-[720px] lg:min-h-[820px]">
          <MemoizedPdfViewer url={pdfUrl || ""} title={`Source PDF for ${summary.file}`} />
        </div>
      </section>

      {/* Right Card: 25-30% Sleek Field Verification Sidebar */}
      <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs min-w-0">
        {/* Document Quick Metadata Strip */}
        <div className="border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Document Review</span>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold",
                summary.confidence && summary.confidence >= 0.8 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              )}
            >
              {percent(summary.confidence, 1)} Confidence
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
            <span>Pages: <strong>{summary.pages ?? 1}</strong></span>
            <span>Received: <strong>{relativeTime(summary.receivedAt)}</strong></span>
          </div>
        </div>

        {/* Extracted Fields Form */}
        <div className="mt-4 flex-1 space-y-5 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h4 className="font-display text-[13px] font-bold text-[#0e0e0e]">
                Extracted Fields
              </h4>
              <p className="text-[9px] text-slate-400">
                {flagged.length} require review · {verified.length} STP verified
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {changed.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setDrafts({})}
                    className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void act("correct")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0e3d36] px-3 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-[#092b26] transition disabled:opacity-50"
                  >
                    <Save size={11} /> Save ({changed.length})
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Group 1: Fields Needing Human Review */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              <AlertTriangle size={12} />
              <span>Review Required ({flagged.length})</span>
            </div>

            {flagged.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5 text-[10px] text-emerald-800">
                ✓ All fields passed automated checks.
              </div>
            ) : (
              <div className="space-y-2">
                {flagged.map(([name, field]) => {
                  const curVal = currentValue(name, field);
                  const origVal = originalValue(name, field);
                  const isDirty = curVal !== origVal;

                  return (
                    <div
                      key={name}
                      className={cn(
                        "rounded-xl border p-2.5 transition",
                        isDirty
                          ? "border-[#47a2b0] bg-[#47a2b0]/5 ring-1 ring-[#47a2b0]/30"
                          : "border-amber-200 bg-amber-50/30"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-[#0e0e0e]" htmlFor={`live-flagged-${name}`}>
                          {humanize(name)}
                        </label>
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold text-amber-800">
                          Review Required
                        </span>
                      </div>

                      <div className="relative mt-1.5">
                        <input
                          id={`live-flagged-${name}`}
                          value={curVal}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [name]: e.target.value }))}
                          placeholder="Enter verified value..."
                          className={cn(
                            "w-full rounded-lg border bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0e0e0e] outline-none transition",
                            isDirty ? "border-[#47a2b0]" : "border-amber-300 focus:border-[#47a2b0]"
                          )}
                        />
                        {isDirty && (
                          <span className="absolute -top-2 right-2 rounded-full bg-[#47a2b0] px-1.5 text-[7px] font-bold text-white shadow-xs">
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

          {/* Group 2: STP Verified Fields (Locked with Optional Override) */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-[#45bd8d]" />
                <span>Verified Fields ({verified.length})</span>
              </div>
              <span className="text-[8px] text-slate-400">Locked</span>
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
              {verified.map(([name, field]) => {
                const isUnlocked = unlockedFields.has(name);
                const curVal = currentValue(name, field);
                const origVal = originalValue(name, field);
                const isDirty = curVal !== origVal;

                return (
                  <div key={name} className="flex items-center justify-between gap-2 p-2 text-[10px]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-600">{humanize(name)}</div>
                    </div>

                    <div className="flex items-center gap-1.5 text-right">
                      {isUnlocked ? (
                        <input
                          value={curVal}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [name]: e.target.value }))}
                          className={cn(
                            "w-28 rounded border bg-white px-1.5 py-0.5 text-right text-[10px] font-semibold outline-none",
                            isDirty ? "border-[#47a2b0]" : "border-slate-300"
                          )}
                        />
                      ) : (
                        <span className="truncate font-semibold text-[#0e0e0e] max-w-[120px]" title={curVal}>
                          {curVal || "—"}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleUnlock(name)}
                        title={isUnlocked ? "Lock field" : "Unlock to override"}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                      >
                        {isUnlocked ? <Lock size={10} className="text-amber-600" /> : <Pencil size={10} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pinned Action Controls */}
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => void act("approve")}
            disabled={busy !== null}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#45bd8d] py-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-[#39a87d] transition disabled:opacity-50"
          >
            <CheckCircle2 size={14} /> Approve &amp; deliver
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy !== null}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
            >
              <RefreshCw size={11} /> Reprocess
            </button>
            <button
              type="button"
              onClick={() => void act("reject")}
              disabled={busy !== null}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50/70 py-2 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
            >
              <XCircle size={11} /> Reject
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
