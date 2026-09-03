import { useCallback, useRef, useState } from "react";
import { CloudUpload, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { mintUploadGrants, uploadToBlob, bytes } from "./api";

type Queued = {
  file: File;
  state: "pending" | "uploading" | "done" | "error";
  message?: string;
};

/**
 * Bulk upload straight into the pipeline's intake container.
 *
 * There is no processing API call anywhere in here, and that is the design:
 * the write to `docs-in/<run>/<name>.pdf` IS the trigger. Event Grid picks the
 * blob up within a second or two and stage 1 begins, so the upload path needs
 * no knowledge of the Function App at all.
 */
export function UploadPanel({
  onUploaded,
  runId,
}: {
  onUploaded: () => void;
  runId?: string;
}) {
  const [queue, setQueue] = useState<Queued[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = useCallback((files: FileList | File[]) => {
    const incoming = [...files].filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    const rejected = [...files].length - incoming.length;
    if (rejected > 0) {
      toast.error(`${rejected} file(s) skipped`, {
        description: "The pipeline takes PDFs only — it does not unpack archives or images.",
      });
    }
    if (incoming.length === 0) return;
    setQueue((current) => {
      const seen = new Set(current.map((q) => `${q.file.name}:${q.file.size}`));
      const fresh = incoming
        .filter((f) => !seen.has(`${f.name}:${f.size}`))
        .map((file) => ({ file, state: "pending" as const }));
      return [...current, ...fresh];
    });
  }, []);

  const send = async () => {
    const pending = queue.filter((q) => q.state === "pending" || q.state === "error");
    if (pending.length === 0) return;
    setBusy(true);

    try {
      const { grants, runId: usedRunId } = await mintUploadGrants(
        pending.map((q) => ({ name: q.file.name })),
        runId
      );

      setQueue((current) =>
        current.map((q) => (pending.includes(q) ? { ...q, state: "uploading" as const } : q))
      );

      // Bounded concurrency. A 40-file drop fired at once would open 40 TLS
      // connections and the browser would serialise most of them anyway, while
      // any single failure gets lost in the noise.
      let cursor = 0;
      let uploaded = 0;
      const failures: string[] = [];
      const worker = async () => {
        while (cursor < pending.length) {
          const index = cursor++;
          const entry = pending[index];
          try {
            await uploadToBlob(grants[index], entry.file);
            uploaded += 1;
            setQueue((current) =>
              current.map((q) => (q === entry ? { ...q, state: "done" as const } : q))
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(entry.file.name);
            setQueue((current) =>
              current.map((q) => (q === entry ? { ...q, state: "error" as const, message } : q))
            );
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      if (uploaded > 0) {
        toast.success(`${uploaded} document(s) uploaded to ${usedRunId}/`, {
          description: "Event Grid starts stage 1 automatically. Watch them move Queued → Processing → Needs Review.",
        });
        onUploaded();
      }
      if (failures.length > 0) {
        toast.error(`${failures.length} upload(s) failed`, { description: failures.join(", ") });
      }
    } catch (error) {
      toast.error("Could not start the upload", {
        description: error instanceof Error ? error.message : String(error),
      });
      setQueue((current) =>
        current.map((q) => (q.state === "uploading" ? { ...q, state: "pending" as const } : q))
      );
    } finally {
      setBusy(false);
    }
  };

  const readyCount = queue.filter((q) => q.state === "pending" || q.state === "error").length;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-[15px] font-bold tracking-[-.03em] text-[#142b4b]">
            Upload documents
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            PDFs land in the pipeline's intake container. That write is the trigger — nothing calls a
            processing API. Drop as many as you like.
          </p>
        </div>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-9 text-center transition",
          dragging ? "border-[#156bc9] bg-blue-50/60" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
        )}
      >
        <CloudUpload size={26} className={dragging ? "text-[#156bc9]" : "text-slate-400"} />
        <div className="mt-3 text-[12px] font-bold text-[#142b4b]">
          Drop PDFs here, or click to choose
        </div>
        <div className="mt-1 text-[10px] text-slate-400">
          Multiple files supported · uploaded directly to Azure, so size is not capped by the app
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) add(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {queue.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {queue.map((entry, index) => (
            <div
              key={`${entry.file.name}-${index}`}
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2"
            >
              <FileText size={14} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-[#142b4b]">
                  {entry.file.name}
                </div>
                <div className="text-[9px] text-slate-400">
                  {bytes(entry.file.size)}
                  {entry.message ? ` · ${entry.message}` : ""}
                </div>
              </div>
              {entry.state === "uploading" && <Loader2 size={13} className="animate-spin text-[#156bc9]" />}
              {entry.state === "done" && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">
                  Uploaded
                </span>
              )}
              {entry.state === "error" && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-rose-600">Failed</span>
              )}
              {entry.state === "pending" && !busy && (
                <button
                  onClick={() => setQueue((current) => current.filter((q) => q !== entry))}
                  className="text-slate-400 hover:text-slate-600"
                  aria-label={`Remove ${entry.file.name}`}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          onClick={() => setQueue([])}
          disabled={busy || queue.length === 0}
          className="rounded-xl border border-slate-200 px-3.5 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          Clear
        </button>
        <button
          onClick={() => void send()}
          disabled={busy || readyCount === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-[#156bc9] px-4 py-2 text-[10px] font-bold text-white shadow-[0_8px_18px_rgba(21,107,201,.2)] hover:bg-[#0d5aae] disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {busy ? "Uploading…" : `Upload ${readyCount || ""} and process`}
        </button>
      </div>
    </div>
  );
}
