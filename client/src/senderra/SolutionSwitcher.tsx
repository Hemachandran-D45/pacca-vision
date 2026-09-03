import { useState } from "react";
import { Boxes, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOLUTIONS, useSolution, type SolutionKey } from "./SolutionContext";

/**
 * Switches the Client 1 workspace between its two solutions.
 *
 * This is the boundary between the fixture demo and the live pipeline. The
 * shell, navigation and RBAC do not change across it — only what the
 * operational screens read — which is the whole point of presenting PACCA as a
 * common platform that clients configure rather than a bespoke build.
 */
export function SolutionSwitcher() {
  const { solutionKey, solution, setSolution } = useSolution();
  const [open, setOpen] = useState(false);

  const choose = (key: SolutionKey) => {
    setSolution(key);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:bg-slate-50"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Boxes size={15} className="shrink-0 text-[#156bc9]" />
        <span className="hidden min-w-0 sm:block">
          <span className="block text-[8px] font-bold uppercase tracking-[.12em] text-slate-400">
            Solution
          </span>
          <span className="block truncate text-[11px] font-bold text-[#142b4b]">{solution.name}</span>
        </span>
        {solution.live && (
          <span className="hidden rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[.08em] text-emerald-700 sm:inline">
            Live
          </span>
        )}
        <ChevronDown size={13} className={cn("shrink-0 text-slate-400 transition", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="listbox"
            className="absolute right-0 z-40 mt-2 w-[330px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(20,43,75,.16)]"
          >
            {Object.values(SOLUTIONS).map((entry) => (
              <button
                key={entry.key}
                role="option"
                aria-selected={entry.key === solutionKey}
                onClick={() => choose(entry.key)}
                className={cn(
                  "block w-full rounded-xl p-3 text-left transition",
                  entry.key === solutionKey ? "bg-blue-50/70" : "hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#142b4b]">{entry.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[.08em]",
                      entry.live
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {entry.live ? "Live pipeline" : "Demo fixtures"}
                  </span>
                  {entry.key === solutionKey && <Check size={13} className="ml-auto text-[#156bc9]" />}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{entry.summary}</p>
                <p className="mt-1.5 text-[9px] leading-relaxed text-slate-400">{entry.pipeline}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
