import { useMemo, useState } from "react";
import { RefreshCw, Search, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bytes,
  duration,
  fetchDocuments,
  humanize,
  relativeTime,
  usd,
  usePolled,
  type DocumentSummary,
} from "./api";
import { ConfidenceBar, EmptyBlock, ErrorBlock, LiveBadge, LoadingBlock, StatusPill } from "./parts";
import { UploadPanel } from "./UploadPanel";

const STATUS_FILTERS = ["All", "Queued", "Processing", "Needs Review", "In HIL Review", "Processed", "Triage", "Failed"] as const;

/**
 * The Documents tab, reading the pipeline's Cosmos projection.
 *
 * Filtering happens client-side on purpose. The list is one cross-partition
 * scan of the `extract`/`ocr`/`review` items and re-querying per keystroke
 * would burn RU for a result the browser already holds. The trigger to move
 * filtering server-side is the same one as for the dashboard: a load costing
 * more than ~5,000 RU.
 */
export function DocumentsLive({ onOpen }: { onOpen: (documentId: string) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [docType, setDocType] = useState("All");
  const [showUpload, setShowUpload] = useState(false);

  const { data, error, loading, refresh } = usePolled(() => fetchDocuments(), 5000);

  const documents = data?.documents ?? [];
  const docTypes = useMemo(
    () => ["All", ...new Set(documents.map((d) => d.docType).filter((v): v is string => Boolean(v)))],
    [documents]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((d) => {
      if (status !== "All" && d.uiStatus !== status) return false;
      if (docType !== "All" && d.docType !== docType) return false;
      if (!needle) return true;
      return (
        d.docId.toLowerCase().includes(needle) ||
        d.runId.toLowerCase().includes(needle) ||
        (d.docType ?? "").toLowerCase().includes(needle)
      );
    });
  }, [documents, query, status, docType]);

  const inFlight = documents.filter((d) => d.uiStatus === "Queued" || d.uiStatus === "Processing").length;

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
            Documents
          </h1>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {documents.length} document{documents.length === 1 ? "" : "s"} in the pipeline
            {inFlight > 0 && (
              <span className="ml-1 font-semibold text-[#47a2b0]">· {inFlight} in flight</span>
            )}
            <span className="ml-1 text-slate-400">· refreshing every 5s</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : undefined} />
            Refresh
          </button>
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white shadow-[0_8px_18px_rgba(71,162,176,.2)] hover:bg-[#37828e]"
          >
            <Upload size={13} />
            {showUpload ? "Hide upload" : "Upload documents"}
          </button>
        </div>
      </div>

      {showUpload && (
        <UploadPanel
          onUploaded={() => {
            void refresh();
          }}
        />
      )}

      {error && <ErrorBlock error={error} onRetry={() => void refresh()} />}

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search document id, run or type…"
              className="h-9 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-[11px] text-slate-700 outline-none focus:border-[#47a2b0]"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as (typeof STATUS_FILTERS)[number])}
            className="h-9 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 outline-none focus:border-[#47a2b0]"
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === "All" ? "All statuses" : value}
              </option>
            ))}
          </select>
          <select
            value={docType}
            onChange={(event) => setDocType(event.target.value)}
            className="h-9 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 outline-none focus:border-[#47a2b0]"
          >
            {docTypes.map((value) => (
              <option key={value} value={value}>
                {value === "All" ? "All document types" : humanize(value)}
              </option>
            ))}
          </select>
        </div>

        {loading && documents.length === 0 ? (
          <LoadingBlock />
        ) : visible.length === 0 ? (
          <EmptyBlock
            title={documents.length === 0 ? "No documents yet" : "Nothing matches those filters"}
            hint={
              documents.length === 0
                ? "Upload a PDF to start the pipeline. It lands in the intake container, Event Grid fires, and the document appears here within seconds."
                : "Clear the search or choose a different status."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Flagged</th>
                  <th className="px-4 py-3">Pages</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Latency</th>
                  <th className="px-4 py-3">Received</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((doc) => (
                  <DocumentRow key={doc.documentId} doc={doc} onOpen={onOpen} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentRow({ doc, onOpen }: { doc: DocumentSummary; onOpen: (id: string) => void }) {
  return (
    <tr
      onClick={() => onOpen(doc.documentId)}
      className="cursor-pointer border-b border-slate-50 transition hover:bg-[#ebf5f7]/40"
    >
      <td className="px-4 py-3">
        <div className="text-[11px] font-bold text-[#0e0e0e]">{doc.file}</div>
        <div className="mt-0.5 text-[9px] text-slate-400">
          {doc.runId} · {bytes(doc.fileBytes)}
        </div>
      </td>
      <td className="px-4 py-3 text-[11px] text-slate-600">{humanize(doc.docType)}</td>
      <td className="px-4 py-3">
        <StatusPill status={doc.uiStatus} />
      </td>
      <td className="px-4 py-3">
        <ConfidenceBar value={doc.confidence} />
      </td>
      <td className="px-4 py-3">
        {doc.fieldsNeedingReview ? (
          <span
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-bold",
              "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/70"
            )}
          >
            {doc.fieldsNeedingReview}/{doc.fieldCount ?? "?"}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums text-[11px] text-slate-600">{doc.pages ?? "—"}</td>
      <td className="px-4 py-3 tabular-nums text-[11px] text-slate-600">{usd(doc.costUsd, 3)}</td>
      <td className="px-4 py-3 tabular-nums text-[11px] text-slate-600">{duration(doc.latencyMs)}</td>
      <td className="px-4 py-3 text-[11px] text-slate-500">{relativeTime(doc.receivedAt)}</td>
    </tr>
  );
}
