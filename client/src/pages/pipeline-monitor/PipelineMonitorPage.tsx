import { useState } from "react";
import { Activity, AlertCircle, Pause, Play, RefreshCw, Target, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionHeading } from "@/components/common/SectionHeading";
import { StatusPill } from "@/components/common/StatusPill";
import { analyticsData, documents, stageData } from "@/data/mockData";

export default function PipelineMonitorPage() {
  const [paused, setPaused] = useState(false);

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Representative demo telemetry · static snapshot
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Stage health, throughput, and currently processing jobs across the workspace.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPaused(!paused)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
          >
            {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? "Resume live" : "Pause live"}
          </button>
          <button onClick={() => toast("Monitor refreshed")} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Activity} label="Processing now" value="128" delta="+12" detail="documents in stages" tone="blue" />
        <MetricCard icon={TimerReset} label="Median latency" value="8.2s" delta="1.4s" detail="vs previous 7 days" tone="purple" />
        <MetricCard icon={AlertCircle} label="Failures" value="14" delta="-22%" detail="last 24 hours" tone="red" />
        <MetricCard icon={RefreshCw} label="Retries" value="36" delta="-8%" detail="last 24 hours" tone="amber" />
        <MetricCard icon={Target} label="SLA compliance" value="98.6%" delta="+0.8%" detail="last 24 hours" tone="green" />
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeading title="Stage status" eyebrow="Documents currently in each logical pipeline stage" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stageData.slice(0, 7).map((stage) => (
            <div key={stage.name} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#0e0e0e]">
                  <stage.icon size={15} className="text-[#47a2b0]" />
                  {stage.name}
                </div>
                <StatusPill status={stage.tone === "red" ? "Attention" : stage.tone === "amber" ? "Warning" : "Healthy"} />
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div className="font-display text-2xl font-bold text-[#0e0e0e]">{stage.count}</div>
                <div className="text-[10px] font-semibold text-[#45bd8d]">{stage.delta} / 7d</div>
              </div>
              <div className="mt-2 text-[9px] font-semibold text-slate-500">{stage.name === "HIL Review" ? "Awaiting review" : "Documents in stage"}</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn("h-full rounded-full", stage.tone === "red" ? "bg-[#e04f4f]" : stage.tone === "amber" ? "bg-[#f2c94c]" : "bg-[#47a2b0]")}
                  style={{ width: `${stage.tone === "red" ? 34 : stage.tone === "amber" ? 48 : 78}%` }}
                />
              </div>
              <div className="mt-2 text-[9px] text-slate-400">{stage.tone === "red" ? "Queue requires attention" : "Within expected operating range"}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <SectionHeading title="Currently processing" eyebrow="Documents moving through logical stages" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[9px] uppercase tracking-wider text-slate-400">
                  <th className="pb-3 font-bold">Document</th>
                  <th className="pb-3 font-bold">Stage</th>
                  <th className="pb-3 font-bold">Started</th>
                  <th className="pb-3 font-bold">Latency</th>
                </tr>
              </thead>
              <tbody>
                {documents.slice(0, 4).map((doc, i) => (
                  <tr key={doc.id} className="border-b border-slate-100 text-[10px]">
                    <td className="py-3 font-semibold text-[#0e0e0e]">{doc.file}</td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#47a2b0]" />
                        {stageData[(i + 1) % stageData.length].name}
                      </span>
                    </td>
                    <td className="py-3 text-slate-400">{i + 1}m ago</td>
                    <td className="py-3 font-mono text-slate-500">{["2.1s", "4.8s", "7.2s", "1.9s"][i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <SectionHeading title="Failure & retry signal" eyebrow="Last 24 hours" />
          <div className="mt-5 h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData} margin={{ top: 5, right: 0, left: -28, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf1f5" />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#8b98a9" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#8b98a9" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6ebf1", fontSize: 11 }} />
                <Bar dataKey="failed" fill="#e04f4f" radius={[4, 4, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
