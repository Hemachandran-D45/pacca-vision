import { useState } from "react";
import { Phone } from "lucide-react";
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

  if (!outreach?.visible) return null;

  const skipText = outreach.skipReason ? SKIP_LABEL[outreach.skipReason] ?? outreach.skipReason : null;
  const title = outreach.enabled
    ? "Fire the same IVR outreach POST as extract"
    : skipText ?? "Outreach is not eligible";

  const run = async () => {
    if (!outreach.enabled || busy) return;
    setBusy(true);
    try {
      const result = await triggerIvr(documentId);
      const status = result.trigger_status;
      if (status === "accepted") {
        const bits = [
          result.call_id ? `call_id ${result.call_id}` : null,
          result.call_status ? String(result.call_status) : null,
        ].filter(Boolean);
        toast.success("Outreach accepted", {
          description: bits.length ? bits.join(" · ") : "IVR queued the call",
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
      disabled={!outreach.enabled || busy}
      title={title}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      <Phone size={14} />
      {busy ? "Triggering…" : "Trigger outreach"}
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
