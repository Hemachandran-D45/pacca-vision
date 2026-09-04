import {
  Activity,
  AlertCircle,
  BrainCircuit,
  Check,
  ChevronRight,
  Cloud,
  Code2,
  Database,
  GitBranch,
  Inbox,
  Pencil,
  Send,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";
import { StatusPill } from "@/components/common/StatusPill";

export default function DeployPage({ kind }: { kind: "environment" | "deployment" | "infrastructure" }) {
  if (kind === "deployment") {
    return (
      <div className="space-y-5 p-4 sm:p-7 lg:p-9">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Deploy</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">Deployment Wizard</h2>
          <p className="mt-2 text-[11px] text-slate-500">Promote a validated pipeline configuration through controlled environments.</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center justify-between">
              <SectionHeading title="Promote release" eyebrow="Invoice Processing v2.4" />
              <StatusPill status="Draft" />
            </div>

            <div className="mt-7 flex items-center gap-2">
              {["Review", "Test", "Approve", "Deploy"].map((step, i) => (
                <div key={step} className="flex flex-1 items-center gap-2">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold",
                      i === 0 ? "bg-[#47a2b0] text-white" : "bg-slate-100 text-slate-400"
                    )}
                  >
                    {i + 1}
                  </div>
                  <span className={cn("hidden text-[10px] font-bold sm:block", i === 0 ? "text-[#0e0e0e]" : "text-slate-400")}>
                    {step}
                  </span>
                  {i < 3 && <div className="h-px flex-1 bg-slate-200" />}
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl bg-slate-50 p-5">
              <div className="text-[11px] font-bold text-[#0e0e0e]">Release summary</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["Pipeline", "Invoice Processing"],
                  ["Version", "v2.4"],
                  ["Metadata contract", "v1.8"],
                  ["Changed by", "Suresh Kiran · 12 min ago"],
                  ["Test coverage", "48 / 48 passed"],
                  ["Target", "Client 1"],
                ].map(([a, b]) => (
                  <div key={a}>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">{a}</div>
                    <div className="mt-1 text-[11px] font-semibold text-[#0e0e0e]">{b}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => toast.success("Deployment started", { description: "Release v2.4 is rolling out to Client 1." })}
                className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e]"
              >
                <Send size={14} /> Start deployment
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <SectionHeading title="Recent deployments" />
            <div className="mt-4 space-y-3">
              {[
                ["v2.3", "May 07, 16:24", "Live"],
                ["v2.2", "May 02, 11:08", "Live"],
                ["v2.1", "Apr 22, 09:43", "Live"],
              ].map(([v, time, status]) => (
                <div key={v} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ebf5f7] text-[#45bd8d]">
                    <Check size={15} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] font-semibold text-[#0e0e0e]">{v}</div>
                    <div className="mt-0.5 text-[9px] text-slate-400">{time}</div>
                  </div>
                  <StatusPill status={status} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const title = kind === "environment" ? "Environment" : "Infrastructure";
  const cards: Array<[string, string, string, LucideIcon]> =
    kind === "environment"
      ? [
          ["Client 1", "Primary workspace", "Healthy", Cloud],
          ["IHCS Staging", "Pre-release validation", "Healthy", Code2],
          ["Development", "Local iteration", "Attention", WandSparkles],
        ]
      : [
          ["Document ingestion", "Managed compute · representative", "Healthy", Inbox],
          ["Processing orchestration", "Workflow orchestration · representative", "Healthy", GitBranch],
          ["Metadata store", "Metadata store · representative", "Healthy", Database],
          ["Model gateway", "LLM gateway · representative", "Healthy", BrainCircuit],
          ["Observability", "Observability · representative", "Healthy", Activity],
          ["Dead-letter queue", "14 failed messages", "Attention", AlertCircle],
        ];

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Deploy</div>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">{title}</h2>
        <p className="mt-2 text-[11px] text-slate-500">
          {kind === "environment"
            ? "Workspace-specific variables, secrets, and operating modes."
            : "Technical runtime health for the document platform."}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(([name, description, status, Icon]) => (
          <div key={name} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebf5f7] text-[#47a2b0]">
                <Icon size={18} />
              </div>
              <StatusPill status={status} />
            </div>
            <div className="mt-4 text-[13px] font-bold text-[#0e0e0e]">{name}</div>
            <div className="mt-1 text-[10px] text-slate-400">{description}</div>
            <button
              onClick={() => toast(name + " details", { description: "Technical configuration is available to platform administrators." })}
              className="mt-5 inline-flex items-center gap-1 text-[10px] font-bold text-[#47a2b0] hover:text-[#37828e]"
            >
              View details <ChevronRight size={13} />
            </button>
          </div>
        ))}
      </div>

      {kind === "environment" && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <SectionHeading title="Environment variables" eyebrow="Values are encrypted at rest and masked in the UI" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[9px] uppercase tracking-wider text-slate-400">
                  <th className="pb-3 font-bold">Key</th>
                  <th className="pb-3 font-bold">Value</th>
                  <th className="pb-3 font-bold">Updated</th>
                  <th className="pb-3 font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["PACCA_REGION", "ap-south-1", "Today, 09:12"],
                  ["DEFAULT_SLA_SECONDS", "30", "May 07, 16:24"],
                  ["HIL_ESCALATION_MINUTES", "60", "May 01, 11:08"],
                ].map(([a, b, c]) => (
                  <tr key={a} className="border-b border-slate-100 text-[10px]">
                    <td className="py-4 font-mono font-semibold text-[#0e0e0e]">{a}</td>
                    <td className="py-4 font-mono text-slate-500">{b}</td>
                    <td className="py-4 text-slate-400">{c}</td>
                    <td className="py-4">
                      <button onClick={() => toast("Environment variable editor opened")} className="text-slate-400 hover:text-[#47a2b0]">
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
