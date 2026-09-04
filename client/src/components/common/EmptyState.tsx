import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  copy,
  icon: Icon = Inbox,
}: {
  title: string;
  copy: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
        <Icon size={20} />
      </div>
      <div className="mt-4 text-sm font-bold text-slate-700">{title}</div>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">{copy}</p>
    </div>
  );
}
