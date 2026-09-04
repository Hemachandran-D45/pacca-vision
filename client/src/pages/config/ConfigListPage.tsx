import { Filter, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/common/StatusPill";

export default function ConfigListPage({ kind }: { kind: "rules" | "integrations" }) {
  const rules = [
    ["Invoice total check", "Invoice Processing", "12 rules", "Live"],
    ["Invoice total reconciliation", "Invoice Processing", "8 rules", "Live"],
    ["Required invoice field gate", "Invoice Processing", "16 rules", "Draft"],
    ["Tax amount normalization", "Invoice Processing", "6 rules", "Live"],
  ];
  const integrations = [
    ["AWS Textract", "Document understanding", "Connected", "2.3M calls"],
    ["AWS Bedrock", "Claude 3.5 Sonnet", "Connected", "48.2K calls"],
    ["Microsoft OneDrive", "Source connector", "Connected", "1,204 docs"],
    ["Client 1 intake", "Source connector", "Attention", "Credential expires in 8d"],
  ];

  const rows = kind === "rules" ? rules : integrations;

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Configure</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">
            {kind === "rules" ? "Rules & Validations" : "Integrations"}
          </h2>
          <p className="mt-2 text-[11px] text-slate-500">
            {kind === "rules"
              ? "Guard the handoff from extracted data to trusted final metadata."
              : "Manage platform services, source connectors, and model providers."}
          </p>
        </div>
        <button
          onClick={() => toast.success(`${kind === "rules" ? "Rule" : "Integration"} draft created`)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e]"
        >
          <Plus size={14} /> Add {kind === "rules" ? "rule" : "integration"}
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          <label className="flex h-9 min-w-[230px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3">
            <Search size={14} className="text-slate-400" />
            <input className="w-full bg-transparent text-[11px] outline-none" placeholder={`Search ${kind}...`} />
          </label>
          <button onClick={() => toast("Filter options")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-bold text-slate-600">
            <Filter size={14} /> Filter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[9px] uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-3 py-3 font-bold">Scope</th>
                <th className="px-3 py-3 font-bold">{kind === "rules" ? "Coverage" : "Usage"}</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[0]} className="border-b border-slate-100 text-[10px] hover:bg-[#ebf5f7]/40">
                  <td className="px-5 py-4 font-semibold text-[#0e0e0e]">{row[0]}</td>
                  <td className="px-3 py-4 text-slate-500">{row[1]}</td>
                  <td className="px-3 py-4 text-slate-500">{row[2]}</td>
                  <td className="px-3 py-4">
                    <StatusPill status={row[3]} />
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => toast(`${kind === "rules" ? "Rule" : "Integration"} editor opened`)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-[#ebf5f7] hover:text-[#47a2b0]"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
