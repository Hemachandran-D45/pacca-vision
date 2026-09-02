import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CreateSolutionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CreateSolutionResponse = {
  ok?: boolean;
  error?: string;
  path?: string;
  htmlUrl?: string;
  model?: string;
};

export function CreateSolutionDialog({ open, onOpenChange }: CreateSolutionDialogProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState("");

  const resetAndClose = () => {
    if (submitting) return;
    setText("");
    setFieldError("");
    onOpenChange(false);
  };

  const onCreate = async () => {
    const value = text.trim();
    if (!value) {
      setFieldError("Enter solution text before creating.");
      return;
    }
    setFieldError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/solutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value }),
      });
      let payload: CreateSolutionResponse = {};
      try {
        payload = (await response.json()) as CreateSolutionResponse;
      } catch {
        payload = { error: "The server returned an unreadable response." };
      }
      if (!response.ok || payload.ok === false) {
        toast.error(payload.error || "Could not create the solution.");
        return;
      }
      toast.success("Solution created", {
        description: payload.path
          ? `Model output saved as ${payload.path}${payload.model ? ` (${payload.model})` : ""}.`
          : "The generated solution was committed to GitHub.",
      });
      setText("");
      onOpenChange(false);
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) { if (!next) { setText(""); setFieldError(""); } onOpenChange(next); } }}>
      <DialogContent showCloseButton={!submitting} className="rounded-2xl border-slate-200 p-6 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-.04em] text-[#142b4b]">
            Create solution
          </DialogTitle>
          <DialogDescription className="text-[11px] leading-relaxed text-slate-500">
            Describe the solution. PACCA fills a server-side prompt template, calls Chat Completions, and commits the model output as a .txt file.
          </DialogDescription>
        </DialogHeader>
        <label className="block">
          <span className="mb-2 block text-[10px] font-bold text-slate-500">Solution text</span>
          <textarea
            value={text}
            disabled={submitting}
            onChange={(event) => {
              setText(event.target.value);
              if (fieldError) setFieldError("");
            }}
            rows={8}
            placeholder="Enter the solution definition, notes, or operating pattern..."
            className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50"
          />
          {fieldError ? <p className="mt-2 text-[10px] font-semibold text-rose-600">{fieldError}</p> : null}
        </label>
        <DialogFooter className="gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={resetAndClose}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void onCreate()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#156bc9] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#0d5aae] disabled:opacity-70"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {submitting ? "Generating..." : "Create"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
