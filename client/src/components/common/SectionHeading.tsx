import { ChevronRight } from "lucide-react";

export function SectionHeading({
  title,
  eyebrow,
  action,
  onAction,
}: {
  title: string;
  eyebrow?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="font-display text-[16px] font-bold tracking-[-0.025em] text-[#0e0e0e]">{title}</h2>
        {eyebrow && <p className="mt-1 text-[11px] text-slate-500">{eyebrow}</p>}
      </div>
      {action && (
        <button
          onClick={onAction}
          className="group inline-flex items-center gap-1 text-[11px] font-bold text-[#47a2b0] transition hover:text-[#37828e]"
        >
          {action}
          <ChevronRight size={14} className="transition group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}
