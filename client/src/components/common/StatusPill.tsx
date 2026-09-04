import { cn } from "@/lib/utils";
import type { DocumentRow } from "@/data/mockData";

export function StatusPill({ status }: { status: DocumentRow["status"] | string }) {
  const styles: Record<string, string> = {
    // Surgeon Green (#45BD8D)
    Active: "bg-[#45bd8d]/15 text-[#1f845d] ring-[#45bd8d]/30",
    Processed: "bg-[#45bd8d]/15 text-[#1f845d] ring-[#45bd8d]/30",
    Healthy: "bg-[#45bd8d]/15 text-[#1f845d] ring-[#45bd8d]/30",

    // Emids Yellow (#F2C94C)
    "Needs Review": "bg-[#f2c94c]/20 text-[#8a6800] ring-[#f2c94c]/40",
    "HIL Review": "bg-[#f2c94c]/20 text-[#8a6800] ring-[#f2c94c]/40",
    Attention: "bg-[#f2c94c]/20 text-[#8a6800] ring-[#f2c94c]/40",

    // Signal Red (#E04F4F)
    "Validation failed": "bg-[#e04f4f]/15 text-[#b92828] ring-[#e04f4f]/30",
    Degraded: "bg-[#e04f4f]/15 text-[#b92828] ring-[#e04f4f]/30",

    // Sterile Blue (#00B0F0)
    Processing: "bg-[#00b0f0]/15 text-[#027ea9] ring-[#00b0f0]/30",

    // Emids Teal (#47A2B0)
    Live: "bg-[#47a2b0]/15 text-[#256c77] ring-[#47a2b0]/30",

    // Neutral
    Draft: "bg-stone-200/60 text-stone-700 ring-stone-300",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1",
        styles[status] ?? "bg-slate-100 text-slate-600 ring-slate-200"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
