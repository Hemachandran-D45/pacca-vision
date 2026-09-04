import { useState } from "react";
import { Check, History as HistoryIcon, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";

export default function MetadataStudioPage() {
  const [showHistory, setShowHistory] = useState(false);
  const [activeVersion, setActiveVersion] = useState("1.0");

  const fields = [
    ["Invoice Number", "String", "Document extraction", "Required"],
    ["Invoice Date", "Date", "Document extraction", "Required"],
    ["Vendor Name", "String", "Entity extraction", "Required"],
    ["Subtotal", "Currency", "Entity extraction", "Required"],
    ["Tax Amount", "Currency", "Entity extraction", "Required"],
    ["Total Amount", "Currency", "Entity extraction", "Required"],
    ["Currency", "String", "Document extraction", "Required"],
    ["Purchase Order Number", "String", "Document extraction", "Optional"],
    ["Due Date", "Date", "Document extraction", "Optional"],
  ];

  const versions = [
    ["1.0", "Current", "PACCA Admin", "01 Sep 2026", "Added field-level validation mapping and clarified invoice output contract"],
    ["0.9", "Published", "Solution Team", "28 Aug 2026", "Added Purchase Order Number and Due Date as optional fields"],
    ["0.8", "Archived", "PACCA Admin", "22 Aug 2026", "Initial Invoice Processing schema with seven required fields"],
  ];

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Configure</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">Metadata Studio</h2>
          <p className="mt-2 text-[11px] text-slate-500">Define the stable final metadata contract consumed by downstream solutions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[10px] font-bold",
              showHistory ? "border-[#47a2b0]/40 bg-[#ebf5f7] text-[#47a2b0]" : "border-slate-200 bg-white text-slate-600"
            )}
          >
            <HistoryIcon size={14} /> Version history
          </button>
          <button
            onClick={() => toast.success("Schema saved")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e]"
          >
            <Check size={14} /> Save schema
          </button>
        </div>
      </div>

      {showHistory && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#47a2b0]">Schema governance</div>
              <h3 className="mt-1 font-display text-lg font-bold text-[#0e0e0e]">Version history</h3>
              <p className="mt-1 text-[10px] text-slate-500">Track how the Client 1 invoice output contract evolved over time.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-[9px] font-bold text-[#47a2b0] ring-1 ring-[#47a2b0]/30">
              {versions.length} versions
            </span>
          </div>
          <div className="mt-5 grid gap-2">
            {versions.map(([version, status, author, date, note]) => (
              <div
                key={version}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3",
                  activeVersion === version ? "border-[#47a2b0] shadow-sm" : "border-slate-100"
                )}
              >
                <div className="flex min-w-[76px] items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-[#0e0e0e]">v{version}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[8px] font-bold",
                      status === "Current"
                        ? "bg-[#ebf5f7] text-[#45bd8d]"
                        : status === "Published"
                          ? "bg-[#ebf5f7] text-[#47a2b0]"
                          : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {status}
                  </span>
                </div>
                <div className="min-w-[150px] flex-1">
                  <div className="text-[10px] font-semibold text-[#0e0e0e]">{note}</div>
                  <div className="mt-1 text-[9px] text-slate-400">
                    {author} · {date}
                  </div>
                </div>
                {status !== "Current" && (
                  <button
                    onClick={() => {
                      setActiveVersion(version);
                      toast("Schema version selected");
                    }}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold text-slate-600 hover:bg-slate-50"
                  >
                    View version
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Invoice Metadata Schema" eyebrow="Version 1.0 · consumed by Invoice Processing Pipeline" />
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-[#ebf5f7] px-2.5 py-1.5 text-[9px] font-bold text-[#45bd8d]">9 fields</span>
            <span className="rounded-lg bg-[#ebf5f7] px-2.5 py-1.5 text-[9px] font-bold text-[#47a2b0]">7 required</span>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[9px] font-bold text-slate-500">2 optional</span>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[660px] text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[9px] uppercase tracking-wider text-slate-400">
                <th className="pb-3 font-bold">Field</th>
                <th className="pb-3 font-bold">Type</th>
                <th className="pb-3 font-bold">Source</th>
                <th className="pb-3 font-bold">Requirement</th>
                <th className="pb-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(([field, type, source, required]) => (
                <tr key={field} className="border-b border-slate-100 text-[10px]">
                  <td className="py-4 font-mono font-semibold text-[#47a2b0]">{field}</td>
                  <td className="py-4">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{type}</span>
                  </td>
                  <td className="py-4 text-slate-500">{source}</td>
                  <td className="py-4">
                    <span className={cn("rounded-md px-2 py-1 font-semibold", required === "Required" ? "bg-rose-50 text-[#e04f4f]" : "bg-slate-100 text-slate-500")}>
                      {required}
                    </span>
                  </td>
                  <td className="py-4">
                    <button onClick={() => toast("Field editor opened")} className="text-slate-400 hover:text-[#47a2b0]">
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={() => toast("New field added", { description: "Field editor is ready for configuration." })}
          className="mt-4 inline-flex items-center gap-2 text-[10px] font-bold text-[#47a2b0] hover:text-[#37828e]"
        >
          <Plus size={14} /> Add metadata field
        </button>
      </section>
    </div>
  );
}
