import { Phone, UserRoundPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { humanize, type FieldProvenance } from "./api";

/**
 * The origin marker on an extracted field.
 *
 * Three things can put a value in `fields.fields[name].value`: the model read
 * it off the page, a patient or prescriber read it out on an IVR call, or a
 * reviewer typed it. Only the first is evidence from the document, and the
 * server merges the other two in before the UI ever sees them — so without
 * this chip a phone answer is indistinguishable from an extraction, which is
 * exactly the thing an auditor needs to be able to tell apart.
 *
 * The hover carries the audit detail: what the caller was actually asked
 * (`asked_as` off the gaps item, not the extraction prompt), who answered,
 * when, and the call and request ids to trace it back to the IVR backend.
 */

const ORIGIN = {
  ivr: {
    label: "IVR",
    heading: "Collected via IVR call",
    Icon: Phone,
    chip: "border-indigo-200 bg-indigo-50 text-indigo-700",
    dense: "text-indigo-600",
  },
  reviewer: {
    label: "Reviewer",
    heading: "Corrected by a reviewer",
    Icon: UserRoundPen,
    chip: "border-violet-200 bg-violet-50 text-violet-700",
    dense: "text-violet-600",
  },
} as const;

/** Absolute date plus time — a relative "2d ago" is not enough for an audit line. */
function stamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return null;
  return at.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortId(value: string | null | undefined, keep = 12): string | null {
  if (!value) return null;
  return value.length > keep ? `${value.slice(0, keep)}…` : value;
}

function Detail({ provenance }: { provenance: FieldProvenance }) {
  const origin = ORIGIN[provenance.origin];
  const at = stamp(provenance.at);
  const call = shortId(provenance.callId);

  return (
    <div className="max-w-[240px] space-y-1 py-0.5 text-[10px] leading-relaxed">
      <div className="font-bold">{origin.heading}</div>

      {provenance.origin === "ivr" ? (
        <>
          {provenance.askedAs && (
            <div className="opacity-90">
              Asked: <span className="italic">“{provenance.askedAs}”</span>
            </div>
          )}
          {provenance.by && <div className="opacity-90">Answered by: {humanize(provenance.by)}</div>}
        </>
      ) : (
        provenance.by && <div className="opacity-90">By: {provenance.by}</div>
      )}

      {at && <div className="opacity-75">{at}</div>}

      {(call || provenance.requestId != null) && (
        <div className="font-mono opacity-60">
          {provenance.requestId != null && `req #${provenance.requestId}`}
          {provenance.requestId != null && call && " · "}
          {call && `call ${call}`}
        </div>
      )}
    </div>
  );
}

/**
 * `dense` drops the chip's border and background for tight rows — the HIL
 * sidebar's locked-field list has no room for a full pill.
 */
export function FieldProvenanceBadge({
  provenance,
  dense = false,
  className,
}: {
  provenance: FieldProvenance | null | undefined;
  dense?: boolean;
  className?: string;
}) {
  if (!provenance) return null;
  const origin = ORIGIN[provenance.origin];
  const { Icon } = origin;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex shrink-0 cursor-help items-center gap-1 font-bold",
            dense
              ? cn("text-[8px] uppercase tracking-[.06em]", origin.dense)
              : cn("rounded-md border px-1.5 py-0.5 text-[8px]", origin.chip),
            className
          )}
        >
          <Icon size={dense ? 9 : 10} aria-hidden />
          {origin.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <Detail provenance={provenance} />
      </TooltipContent>
    </Tooltip>
  );
}

/** Plain-text equivalent, for `title` attributes where a tooltip cannot go. */
export function provenanceTitle(provenance: FieldProvenance | null | undefined): string | undefined {
  if (!provenance) return undefined;
  const bits: string[] = [ORIGIN[provenance.origin].heading];
  if (provenance.askedAs) bits.push(`asked: “${provenance.askedAs}”`);
  if (provenance.by) bits.push(`by ${humanize(provenance.by)}`);
  const at = stamp(provenance.at);
  if (at) bits.push(at);
  return bits.join(" · ");
}
