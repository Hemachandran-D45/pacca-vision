import { useState } from "react";
import { CheckCircle2, Loader2, Phone, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { triggerIvr, type OutreachHint } from "@/senderra/api";

const SKIP_LABEL: Record<string, string> = {
  disabled: "PACCA_IVR_TRIGGER_ENABLED is off or IVR_TRIGGER_URL is not set.",
  skipped_not_outbound: "This document is not outbound — IVR will not place a call.",
  skipped_no_gaps: "No Cosmos gaps item (or openCount is 0).",
  skipped_no_contact: "IVR backend refused contact details — blank phone still triggers when other required fields are empty.",
  skipped_no_patient_gaps: "No open patient-askable gap with a description.",
};

export function IvrOutreachButton({
  documentId,
  outreach,
  onDone,
  className,
}: {
  documentId: string;
  outreach?: OutreachHint | null;
  onDone?: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [called, setCalled] = useState(false);
  const [settled, setSettled] = useState(false);

  if (!outreach?.visible) return null;

  const isCompleted = settled || outreach.gapStatus === "resolved" || outreach.openCount === 0;
  const isCalling = !isCompleted && (called || outreach.gapStatus === "in_progress");
  const skipText = outreach.skipReason ? SKIP_LABEL[outreach.skipReason] ?? outreach.skipReason : null;
  const title = isCompleted
    ? "All fields settled via IVR outreach call"
    : isCalling
    ? "IVR call active · Status routed to IVR"
    : outreach.enabled
    ? "Place call to patient via IVR outreach and update status to Routed to IVR"
    : skipText ?? "Outreach is not eligible";

  const run = async () => {
    if (!outreach.enabled || busy || isCompleted) return;
    setBusy(true);
    try {
      const result = await triggerIvr(documentId);
      const status = result.trigger_status;
      const callStatus = String(result.call_status || "").toUpperCase();
      const errorText = (result.trigger_error || "").toLowerCase();

      if (callStatus === "COMPLETED" || errorText.includes("already completed") || errorText.includes("completed")) {
        setSettled(true);
        setCalled(false);
        const bits = [
          result.request_id ? `request #${result.request_id}` : null,
        ].filter(Boolean);

        toast.success("Outreach Settled", {
          description: bits.length
            ? `All fields settled via IVR call (${bits.join(" · ")}). Document marked processed.`
            : "All fields settled via IVR call. Document marked processed.",
        });
      } else if (
        status === "accepted" ||
        callStatus === "CALLING" ||
        errorText.includes("already calling") ||
        errorText.includes("already in progress")
      ) {
        setCalled(true);
        const bits = [
          result.call_id ? `call_id ${result.call_id}` : null,
          result.call_status ? String(result.call_status) : null,
          result.request_id ? `request #${result.request_id}` : null,
        ].filter(Boolean);

        toast.success("Routed to IVR", {
          description: bits.length ? `Call active · ${bits.join(" · ")}` : "Outreach call in progress · Status updated to Routed to IVR",
        });
      } else if (status === "failed" || status === "rejected") {
        toast.error(`Outreach ${status}`, {
          description: result.trigger_error || `HTTP ${result.trigger_http_status ?? "—"}`,
        });
      } else {
        toast.message("Outreach skipped", {
          description: SKIP_LABEL[status] ?? result.skipReason ?? status,
        });
      }
      onDone?.();
    } catch (err) {
      toast.error("Outreach trigger failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const button = (
    <button
      type="button"
      onClick={() => void run()}
      disabled={!outreach.enabled || busy || isCompleted}
      title={title}
      className={
        className ??
        `inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-75 ${
          isCompleted
            ? "border-emerald-200 bg-emerald-50/80 text-emerald-700 shadow-xs"
            : isCalling
            ? "border-indigo-200 bg-indigo-50/80 text-indigo-700 shadow-xs"
            : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/30"
        }`
      }
    >
      {busy ? (
        <>
          <Loader2 size={14} className="animate-spin text-[#47a2b0]" />
          <span>Connecting…</span>
        </>
      ) : isCompleted ? (
        <>
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span>IVR Completed</span>
        </>
      ) : isCalling ? (
        <>
          <PhoneCall size={14} className="animate-pulse text-indigo-600" />
          <span>Routed to IVR</span>
        </>
      ) : (
        <>
          <Phone size={14} className="text-indigo-600" />
          <span>Call (Route to IVR)</span>
        </>
      )}
    </button>
  );

  if (outreach.enabled) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
  );
}
