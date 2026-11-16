import type { LucideIcon } from "lucide-react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";

export function MetricCard({
  icon: Icon,
  label,
  value,
  delta,
  detail,
  tone = "teal",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta: string;
  detail: string;
  tone?: "teal" | "blue" | "amber" | "green" | "purple" | "red";
}) {
  const iconStyles: Record<string, string> = {
    teal: "bg-[#47a2b0]/15 text-[#37828e]",
    blue: "bg-[#00b0f0]/15 text-[#027ea9]",
    amber: "bg-[#f2c94c]/20 text-[#8a6800]",
    green: "bg-[#45bd8d]/15 text-[#1f845d]",
    purple: "bg-[#b89dcb]/25 text-[#694884]",
    red: "bg-[#e04f4f]/15 text-[#b92828]",
  };

  return (
    <div className="group rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_2px_12px_rgba(14,14,14,.025)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(71,162,176,.12)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", iconStyles[tone] ?? iconStyles.teal)}>
          <Icon size={18} strokeWidth={2} />
        </div>
        {delta && (
          <span
            className={cn(
              "flex items-center gap-1 text-[10px] font-bold",
              delta.startsWith("-") ? "text-[#e04f4f]" : "text-[#1f845d]"
            )}
          >
            <TrendingUp size={12} />
            {delta}
          </span>
        )}
      </div>
      <div className="mt-4 text-[11px] font-semibold text-stone-500">{label}</div>
      <div className="mt-1 font-display text-[27px] font-bold tracking-[-0.045em] text-[#0e0e0e]">{value}</div>
      <div className="mt-1 text-[10px] text-stone-400">{detail}</div>
      <div className="mt-3">
        <Sparkline tone={tone} />
      </div>
    </div>
  );
}
