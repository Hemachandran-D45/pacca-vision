import { cn } from "@/lib/utils";
import type { DocumentRow } from "@/data/mockData";
import { Check, Clock, Copy, AlertTriangle, Loader2, PhoneCall, CircleDot } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StatusConfig = {
  style: string;
  icon: LucideIcon;
  iconClass?: string;
};

const CONFIGS: Record<string, StatusConfig> = {
  // Processed / Active (High contrast emerald)
  Active: { style: "bg-emerald-50 text-emerald-800 ring-emerald-300 font-bold", icon: Check },
  Processed: { style: "bg-emerald-50 text-emerald-800 ring-emerald-300 font-bold", icon: Check },
  Healthy: { style: "bg-emerald-50 text-emerald-800 ring-emerald-300 font-bold", icon: Check },

  // Human in the loop review (High contrast amber/gold)
  "Needs Review": { style: "bg-amber-50 text-amber-900 ring-amber-300 font-bold", icon: Clock },
  "HIL Review": { style: "bg-amber-50 text-amber-900 ring-amber-300 font-bold", icon: Clock },
  Attention: { style: "bg-amber-50 text-amber-900 ring-amber-300 font-bold", icon: Clock },

  // Failures (High contrast rose/red)
  "Validation failed": { style: "bg-rose-50 text-rose-900 ring-rose-300 font-bold", icon: AlertTriangle },
  Failed: { style: "bg-rose-50 text-rose-900 ring-rose-300 font-bold", icon: AlertTriangle },
  Degraded: { style: "bg-rose-50 text-rose-900 ring-rose-300 font-bold", icon: AlertTriangle },

  // Processing (Sky blue with spinner)
  Processing: {
    style: "bg-sky-50 text-sky-900 ring-sky-300 font-bold",
    icon: Loader2,
    iconClass: "animate-spin",
  },
  Queued: { style: "bg-slate-100 text-slate-700 ring-slate-300 font-semibold", icon: CircleDot },

  // IVR Outreach (Indigo with phone)
  "Routed to IVR": { style: "bg-indigo-50 text-indigo-900 ring-indigo-300 font-bold", icon: PhoneCall },
  "Route to IVR": { style: "bg-indigo-50 text-indigo-900 ring-indigo-300 font-bold", icon: PhoneCall },

  // Live indicator
  Live: { style: "bg-teal-50 text-teal-900 ring-teal-300 font-bold", icon: Check },

  // Duplicate / Already Processed (Purple with copy icon)
  Duplicate: { style: "bg-purple-100 text-purple-900 ring-purple-300 font-bold", icon: Copy },
  "Already Processed": { style: "bg-purple-100 text-purple-900 ring-purple-300 font-bold", icon: Copy },
  "Duplicate Detected": { style: "bg-purple-100 text-purple-900 ring-purple-300 font-bold", icon: Copy },

  // Neutral
  Draft: { style: "bg-stone-100 text-stone-700 ring-stone-300 font-medium", icon: CircleDot },
};

export function StatusPill({ status }: { status: DocumentRow["status"] | string }) {
  const config = CONFIGS[status] ?? {
    style: "bg-slate-100 text-slate-700 ring-slate-200 font-medium",
    icon: CircleDot,
  };
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] tracking-[0.01em] ring-1 shadow-xs transition-all",
        config.style
      )}
    >
      <Icon size={11} className={cn("shrink-0 stroke-[2.2]", config.iconClass)} />
      <span>{status}</span>
    </span>
  );
}
