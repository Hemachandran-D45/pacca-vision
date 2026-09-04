import { ChevronRight, Filter, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";
import { StatusPill } from "@/components/common/StatusPill";

export default function AdminPage({ kind }: { kind: "users" | "settings" }) {
  if (kind === "settings") {
    return (
      <div className="space-y-5 p-4 sm:p-7 lg:p-9">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Administration</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">Settings</h2>
          <p className="mt-2 text-[11px] text-slate-500">Workspace preferences and policy controls for PACCA Vision.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-1 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
            {["Workspace", "Notifications", "Security", "Data retention", "API access"].map((label, i) => (
              <button
                key={label}
                onClick={() => toast(`${label} settings selected`)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[11px] font-semibold",
                  i === 0 ? "bg-[#ebf5f7] text-[#2d6b75]" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {label}
                {i === 0 && <ChevronRight size={14} />}
              </button>
            ))}
          </aside>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
            <SectionHeading title="Workspace defaults" eyebrow="These settings apply to new pipelines and solutions." />
            <div className="mt-6 max-w-xl space-y-5">
              {[
                ["Workspace name", "Client 1"],
                ["Default processing SLA", "30 seconds"],
                ["Time zone", "Asia / Kolkata"],
              ].map(([label, value]) => (
                <label key={label} className="block">
                  <span className="mb-2 block text-[10px] font-bold text-slate-500">{label}</span>
                  <input
                    defaultValue={value}
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-[11px] text-slate-700 outline-none focus:border-[#47a2b0]"
                  />
                </label>
              ))}

              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                <div>
                  <div className="text-[11px] font-bold text-[#0e0e0e]">Require reviewer reason</div>
                  <div className="mt-1 text-[10px] text-slate-400">Require a note for manual overrides and reprocessing.</div>
                </div>
                <button onClick={() => toast("Reviewer reason policy updated")} className="h-6 w-11 rounded-full bg-[#47a2b0] p-1">
                  <span className="ml-5 block h-4 w-4 rounded-full bg-white shadow-sm" />
                </button>
              </div>

              <button onClick={() => toast.success("Settings saved")} className="rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e]">
                Save changes
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const users = [
    ["Suresh Kiran", "suresh@pacca.vision", "Platform Administrator", "Active", "Today, 09:12"],
    ["Aisha Rahman", "aisha@pacca.vision", "Reviewer", "Active", "Today, 08:45"],
    ["Maya Chen", "maya@pacca.vision", "Solution Builder", "Active", "Yesterday"],
    ["Oliver Grant", "oliver@pacca.vision", "Analyst", "Invited", "May 07"],
  ];

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Administration</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">Users & Roles</h2>
          <p className="mt-2 text-[11px] text-slate-500">Control access without mixing administrative concerns into operations.</p>
        </div>
        <button
          onClick={() => toast.success("Invitation ready", { description: "Enter an email address to invite a new teammate." })}
          className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e]"
        >
          <Plus size={14} /> Invite user
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          <label className="flex h-9 min-w-[230px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3">
            <Search size={14} className="text-slate-400" />
            <input className="w-full bg-transparent text-[11px] outline-none" placeholder="Search people or roles" />
          </label>
          <button onClick={() => toast("Role filters")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-bold text-slate-600">
            <Filter size={14} /> Filter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[9px] uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3 font-bold">User</th>
                <th className="px-3 py-3 font-bold">Role</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 font-bold">Last active</th>
                <th className="px-5 py-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map(([name, email, role, status, last]) => (
                <tr key={email} className="border-b border-slate-100 text-[10px] hover:bg-[#ebf5f7]/40">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ebf5f7] text-[9px] font-bold text-[#47a2b0]">
                        {name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <div>
                        <div className="font-semibold text-[#0e0e0e]">{name}</div>
                        <div className="mt-0.5 text-[9px] text-slate-400">{email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">{role}</span>
                  </td>
                  <td className="px-3 py-4">
                    <StatusPill status={status} />
                  </td>
                  <td className="px-3 py-4 text-slate-500">{last}</td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => toast("User actions", { description: `Manage ${name}'s role and access.` })}
                      className="text-slate-400 hover:text-[#47a2b0]"
                    >
                      <MoreHorizontal size={15} />
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
