import {
  Activity,
  ArrowRight,
  Globe2,
  Layers3,
  LogOut,
  Plus,
  Send,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MockUser } from "@/components/MockAuth";

export function CentralAdminPortal({
  user,
  onLogout,
  onClientWorkspace,
}: {
  user: MockUser;
  onLogout: () => void;
  onClientWorkspace: (client?: string) => void;
}) {
  const clients = [
    ["Client 1", "Active", "Invoice Processing", "#1f9b72"],
    ["Client 2", "Active", "Claims Intake", "#1f9b72"],
    ["Client 3", "Provisioning", "Workspace setup", "#e39b2b"],
  ];
  const stats: Array<[LucideIcon, string, string, string, string]> = [
    [UsersRound, "Clients", "3", "Active tenants and provisioning workspaces", "blue"],
    [Send, "Active deployments", "5", "Across client environments", "purple"],
    [Activity, "Platform health", "Healthy", "All representative services within range", "green"],
    [ShieldCheck, "Access posture", "Enforced", "Central administration policies active", "amber"],
  ];

  return (
    <div className="min-h-screen bg-[#f2f2f0] text-[#0e0e0e]">
      <header className="border-b border-white/10 bg-[#0e0e0e] text-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[#47a2b0]">
              <Globe2 size={20} />
            </div>
            <div>
              <div className="font-display text-[17px] font-bold tracking-[-.03em]">
                PACCA <span className="font-normal text-slate-300">VISION</span>
              </div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[.18em] text-[#47a2b0]">
                Central Admin Portal
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onClientWorkspace()}
              className="rounded-xl border border-white/15 px-3 py-2 text-[10px] font-bold text-slate-200 hover:bg-white/10"
            >
              Open Client Workspace
            </button>
            <button onClick={onLogout} className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-bold text-white hover:bg-white/15">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-7 px-5 py-7 sm:px-8 lg:py-10">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#47a2b0]">Platform administration · {user.name}</div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] text-[#0e0e0e]">One platform. Every client workspace.</h1>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-slate-500">
            Central visibility for PACCA Vision deployments, client lifecycle, environments, and platform health — separate from day-to-day document operations.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(([Icon, label, value, detail, tone]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    tone === "blue"
                      ? "bg-[#ebf5f7] text-[#47a2b0]"
                      : tone === "purple"
                        ? "bg-[#ebf5f7] text-[#b89dcb]"
                        : tone === "green"
                          ? "bg-[#ebf5f7] text-[#45bd8d]"
                          : "bg-amber-50 text-amber-600"
                  )}
                >
                  <Icon size={19} />
                </div>
                <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-400">Central</span>
              </div>
              <div className="mt-5 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{label}</div>
              <div className="mt-1 font-display text-2xl font-bold tracking-[-.04em] text-[#0e0e0e]">{value}</div>
              <div className="mt-2 text-[10px] leading-relaxed text-slate-500">{detail}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Tenant directory</div>
                <h2 className="mt-1 font-display text-xl font-bold tracking-[-.04em]">Clients</h2>
              </div>
              <button onClick={() => toast("Client provisioning flow opened")} className="rounded-xl bg-[#47a2b0] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#37828e]">
                <Plus size={13} className="mr-1 inline" /> Add client
              </button>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[9px] uppercase tracking-wider text-slate-400">
                    <th className="pb-3 font-bold">Client</th>
                    <th className="pb-3 font-bold">Status</th>
                    <th className="pb-3 font-bold">Primary workload</th>
                    <th className="pb-3 text-right font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(([name, status, workload, color]) => (
                    <tr key={name} className="border-b border-slate-100 text-[11px]">
                      <td className="py-4 font-bold text-[#0e0e0e]">{name}</td>
                      <td className="py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold" style={{ background: `${color}16`, color }}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {status}
                        </span>
                      </td>
                      <td className="py-4 text-slate-500">{workload}</td>
                      <td className="py-4 text-right">
                        <button
                          onClick={() => {
                            if (name === "Client 1") onClientWorkspace("Client 1");
                            else toast(`${name} overview opened`);
                          }}
                          className="text-[10px] font-bold text-[#47a2b0] hover:text-[#37828e]"
                        >
                          View overview <ArrowRight size={12} className="ml-1 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="rounded-2xl border border-white/10 bg-[#0e0e0e] p-6 text-white shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#47a2b0]">
              <Layers3 size={21} />
            </div>
            <h2 className="mt-6 font-display text-xl font-bold tracking-[-.04em]">Platform overview</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
              PACCA Vision is the common control plane. Each client workspace keeps its own pipelines, metadata, policies, and operational data isolated.
            </p>
            <div className="mt-6 space-y-3">
              {[
                ["Client workspaces", "3 provisioned"],
                ["Representative regions", "2 active"],
                ["Last platform check", "Today, 14:08"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-white/10 pb-3 text-[10px]">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-bold text-[#47a2b0]">{value}</span>
                </div>
              ))}
            </div>
            <button onClick={() => toast("Infrastructure overview opened")} className="mt-6 w-full rounded-xl border border-white/15 px-3 py-2.5 text-[10px] font-bold text-white hover:bg-white/10">
              View platform health
            </button>
          </aside>
        </div>
      </main>
    </div>
  );
}
