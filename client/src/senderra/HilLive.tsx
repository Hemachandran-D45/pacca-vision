import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Loader2, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchDocument,
  fetchDocuments,
  humanize,
  percent,
  postReview,
  relativeTime,
  usePolled,
  type DocumentSummary,
  type ExtractedField,
} from "./api";
import { ConfidenceBar, EmptyBlock, ErrorBlock, LiveBadge, LoadingBlock, ReasonChips } from "./parts";

/**
 * The HIL workbench.
 *
 * Two rules from the pipeline's own design carry into this screen:
 *
 *  1. The flagged fields lead. The 15-seconds-per-document claim only holds if
 *     the reviewer sees the vetoed fields first, with their evidence, rather
 *     than scrolling a form of twenty correct ones. Everything else is behind
 *     a disclosure.
 *  2. Corrections are gold labels. Each one is written with its original value,
 *     the reviewer and a timestamp, because that record is what turns
 *     production review into a continuous accuracy measurement. That is why the
 *     save path posts a correction set rather than overwriting the extraction.
 */
export function HilLive({
  reviewer,
  reviewerName,
  focusDocumentId,
}: {
  reviewer: string;
  reviewerName: string;
  focusDocumentId?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(focusDocumentId ?? null);

  const queue = usePolled(() => fetchDocuments({ needsReview: "true" }), 8000);
  const documents = queue.data?.documents ?? [];

  useEffect(() => {
    if (focusDocumentId) setSelected(focusDocumentId);
  }, [focusDocumentId]);

  useEffect(() => {
    if (!selected && documents.length > 0) setSelected(documents[0].documentId);
  }, [documents, selected]);

  return (
    <div className="p-4 sm:p-7 lg:p-9">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#156bc9]">
              Client 1 · Prior Auth Processing
            </div>
            <LiveBadge />
          </div>
          <h1 className="mt-2 font-display text-[26px] font-bold tracking-[-.05em] text-[#142b4b]">
            HIL Review
          </h1>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {documents.length} document{documents.length === 1 ? "" : "s"} awaiting a human decision ·
            reviewing as <span className="font-semibold text-slate-700">{reviewerName}</span>
          </p>
        </div>
      </div>

      {queue.error && <ErrorBlock error={queue.error} onRetry={() => void queue.refresh()} />}

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3 text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">
            Review queue
          </div>
          {queue.loading && documents.length === 0 ? (
            <LoadingBlock label="Loading queue…" />
          ) : documents.length === 0 ? (
            <div className="p-6 text-center">
              <Check size={22} className="mx-auto text-emerald-500" />
              <div className="mt-2.5 text-[11px] font-bold text-[#142b4b]">Queue is clear</div>
              <p className="mt-1 text-[10px] text-slate-500">
                Every document has passed the gates or been resolved.
              </p>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              {documents.map((doc) => (
                <QueueRow
                  key={doc.documentId}
                  doc={doc}
                  active={doc.documentId === selected}
                  onSelect={() => setSelected(doc.documentId)}
                />
              ))}
            </div>
          )}
        </div>

        {selected ? (
          <Workbench
            key={selected}
            documentId={selected}
            reviewer={reviewer}
            onResolved={() => {
              void queue.refresh();
              setSelected(null);
            }}
          />
        ) : (
          <EmptyBlock
            title="Nothing selected"
            hint="Choose a document from the queue to open it side by side with its source."
          />
        )}
      </div>
    </div>
  );
}

function QueueRow({
  doc,
  active,
  onSelect,
}: {
  doc: DocumentSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "block w-full border-b border-slate-50 px-4 py-3 text-left transition",
        active ? "bg-blue-50/70 ring-1 ring-inset ring-blue-200" : "hover:bg-slate-50"
      )}
    >
      <div className="truncate text-[11px] font-bold text-[#142b4b]">{doc.file}</div>
      <div className="mt-0.5 text-[9px] text-slate-400">
        {humanize(doc.docType)} · {relativeTime(doc.receivedAt)}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <ConfidenceBar value={doc.confidence} />
        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
          {doc.fieldsNeedingReview ?? 0} flagged
        </span>
      </div>
      {doc.claimedBy && (
        <div className="mt-1.5 text-[9px] font-semibold text-violet-600">Claimed by {doc.claimedBy}</div>
      )}
    </button>
  );
}

function Workbench({
  documentId,
  reviewer,
  onResolved,
}: {
  documentId: string;
  reviewer: string;
  onResolved: () => void;
}) {
  const { data, error, loading, refresh } = usePolled(() => fetchDocument(documentId), null, [documentId]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "save" | "approve" | "reject" | "claim">(null);
  const [showAll, setShowAll] = useState(false);

  const fieldEntries = useMemo(
    () => Object.entries(data?.fields?.fields ?? {}),
    [data]
  );

  /**
   * The value a reviewer is editing: their unsaved draft, else a correction
   * already saved to this document, else what the model extracted. Reading the
   * correction before the extraction is what makes a reopened document show the
   * corrected value instead of silently reverting.
   */
  const currentValue = (name: string, field: ExtractedField): string => {
    if (name in drafts) return drafts[name];
    const correction = data?.review?.corrections?.[name];
    if (correction) return correction.value === null ? "" : String(correction.value);
    return field.value === null ? "" : String(field.value);
  };

  const originalValue = (name: string, field: ExtractedField): string =>
    field.value === null ? "" : String(field.value);

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

  const act = async (
    action: "claim" | "correct" | "approve" | "reject",
    options?: { keepDrafts?: boolean }
  ) => {
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
        // An approval carries any unsaved edits with it, so a reviewer who
        // types a correction and hits Approve cannot lose the correction.
        ...(action === "approve" || action === "correct" ? { corrections } : {}),
      });

      if (action === "claim") toast.success("Document claimed");
      if (action === "correct")
        toast.success(`${changed.length} correction${changed.length === 1 ? "" : "s"} saved`, {
          description: "Recorded with the original value, your identity and a timestamp.",
        });
      if (action === "approve") {
        toast.success("Approved and delivered", {
          description: "Final metadata is marked trusted and the document leaves the queue.",
        });
        onResolved();
        return;
      }
      if (action === "reject") {
        toast.success("Sent back for reprocessing");
        onResolved();
        return;
      }

      if (!options?.keepDrafts) setDrafts({});
      await refresh();
    } catch (caught) {
      toast.error("Could not save", {
        description: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <LoadingBlock label="Opening document…" />;
  if (error) return <ErrorBlock error={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const { summary, fields, review, pdfUrl } = data;
  const flagged = fieldEntries.filter(([, field]) => field.needs_review);
  const rest = fieldEntries.filter(([, field]) => !field.needs_review);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-bold tracking-[-.04em] text-[#142b4b]">
              {summary.file}
            </h2>
            <p className="mt-1 text-[10px] text-slate-500">
              {humanize(fields?.docType ?? summary.docType)} · {summary.pages ?? "?"} pages ·
              confidence {percent(summary.confidence, 1)} · {flagged.length} of {fieldEntries.length} fields
              flagged
            </p>
            <ReasonChips reasons={summary.reviewReasons} className="mt-2.5" />
          </div>
          {!review?.claimed_by && (
            <button
              onClick={() => void act("claim")}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "claim" ? <Loader2 size={12} className="animate-spin" /> : <UserRound size={12} />}
              Claim
            </button>
          )}
          {review?.claimed_by && (
            <span className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[9px] font-bold text-violet-700">
              Claimed by {review.claimed_by}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">
            <FileText size={13} /> Source document
          </h3>
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              title={`Source PDF for ${summary.file}`}
              className="h-[620px] w-full rounded-xl border border-slate-200"
            />
          ) : (
            <div className="flex h-[620px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-[11px] text-slate-400">
              Source PDF is no longer in the intake container.
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[.1em] text-amber-700">
              Fields needing review ({flagged.length})
            </h3>
            <div className="space-y-3">
              {flagged.map(([name, field]) => (
                <EditableField
                  key={name}
                  name={name}
                  field={field}
                  value={currentValue(name, field)}
                  original={originalValue(name, field)}
                  onChange={(value) => setDrafts((current) => ({ ...current, [name]: value }))}
                />
              ))}
              {flagged.length === 0 && (
                <p className="text-[11px] text-slate-500">
                  No field tripped a hard veto — this document was routed for another reason.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <button
              onClick={() => setShowAll((value) => !value)}
              className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-[.1em] text-slate-400"
            >
              <span>Other extracted fields ({rest.length})</span>
              <span className="text-slate-500">{showAll ? "Hide" : "Show"}</span>
            </button>
            {showAll && (
              <div className="mt-3 space-y-3">
                {rest.map(([name, field]) => (
                  <EditableField
                    key={name}
                    name={name}
                    field={field}
                    value={currentValue(name, field)}
                    original={originalValue(name, field)}
                    onChange={(value) => setDrafts((current) => ({ ...current, [name]: value }))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h3 className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">
          Reviewer change summary
        </h3>
        {changed.length === 0 ? (
          <p className="mt-2 text-[11px] text-slate-500">
            No changes yet. Approving with no corrections records that the extraction was already correct
            — which is itself a measurement.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="text-[10px] font-bold text-[#142b4b]">
              {changed.length} field{changed.length === 1 ? "" : "s"} changed
            </div>
            {changed.map((entry) => (
              <div key={entry.name} className="rounded-lg bg-slate-50 px-3 py-2 text-[10px]">
                <span className="font-bold text-[#142b4b]">{humanize(entry.name)}</span>
                <span className="mx-2 text-slate-400 line-through">{entry.from || "empty"}</span>
                <span className="font-semibold text-emerald-700">{entry.to || "empty"}</span>
              </div>
            ))}
          </div>
        )}

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[10px] font-bold text-slate-500">Reviewer note (optional)</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Why the correction was needed…"
            className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-[#156bc9]"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => void act("reject")}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === "reject" ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
            Reject / reprocess
          </button>
          <button
            onClick={() => void act("correct")}
            disabled={busy !== null || changed.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {busy === "save" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {changed.length > 0 ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Save changes"}
          </button>
          <button
            onClick={() => void act("approve")}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-[#156bc9] px-4 py-2.5 text-[10px] font-bold text-white shadow-[0_8px_18px_rgba(21,107,201,.2)] hover:bg-[#0d5aae] disabled:opacity-50"
          >
            {busy === "approve" ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
            Approve &amp; deliver
          </button>
        </div>
      </div>
    </div>
  );
}

function EditableField({
  name,
  field,
  value,
  original,
  onChange,
}: {
  name: string;
  field: ExtractedField;
  value: string;
  original: string;
  onChange: (value: string) => void;
}) {
  const dirty = value !== original;
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        field.needs_review ? "border-amber-200 bg-amber-50/40" : "border-slate-100"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-[10px] font-bold text-[#142b4b]" htmlFor={`field-${name}`}>
          {humanize(name)}
        </label>
        <ConfidenceBar value={field.scores?.field_score ?? null} />
      </div>
      <input
        id={`field-${name}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "mt-2 h-9 w-full rounded-lg border px-3 text-[11px] text-slate-800 outline-none",
          dirty ? "border-emerald-400 bg-emerald-50/40" : "border-slate-200 focus:border-[#156bc9]"
        )}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-slate-400">
        <span>model {percent(field.scores?.model_confidence)}</span>
        <span>ocr {percent(field.scores?.ocr_score)}</span>
        <span>page {field.grounding?.page ?? "—"}</span>
        <span>{field.grounding?.quote_in_document ? `grounded (${field.grounding.match})` : "not grounded"}</span>
      </div>
      {field.quote && (
        <div className="mt-1.5 border-l-2 border-slate-200 pl-2 text-[9px] italic text-slate-500">
          “{field.quote}”
        </div>
      )}
      <ReasonChips reasons={field.review_reasons ?? []} className="mt-2" />
    </div>
  );
}
