import { CheckCircle2, Sparkles, UserRound, WandSparkles, Zap } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionHeading } from "@/components/common/SectionHeading";
import { analyticsData, costData } from "@/data/mockData";
import { AnalyticsLive } from "@/senderra/AnalyticsLive";
import { useSolution } from "@/senderra/SolutionContext";

function MockAnalyticsDashboard() {
  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-slate-500">Operational intelligence across your document estate.</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-[#0e0e0e]">
            <span className="h-2 w-2 rounded-full bg-[#47a2b0]" /> Reporting window · Demo reporting window
          </div>
        </div>
        <select className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 outline-none">
          <option>Last 7 days</option>
          <option>Last 30 days</option>
          <option>Last quarter</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Zap} label="Throughput" value="4,812" delta="18.6%" detail="documents processed" tone="blue" />
        <MetricCard icon={WandSparkles} label="Automation rate" value="94.2%" delta="2.1%" detail="without HIL intervention" tone="green" />
        <MetricCard icon={UserRound} label="HIL rate" value="5.8%" delta="-2.1%" detail="of total documents" tone="amber" />
        <MetricCard icon={Sparkles} label="Mean confidence" value="96.4%" delta="1.2%" detail="across extracted fields" tone="purple" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <SectionHeading title="Throughput & intervention" eyebrow="Daily document volume by outcome" />
            <div className="flex items-center gap-3 text-[9px] text-slate-500">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded bg-[#47a2b0]" />Processed</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded bg-[#b89dcb]" />HIL</span>
            </div>
          </div>
          <div className="mt-5 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData} margin={{ top: 6, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf1f5" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8b98a9" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#8b98a9" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6ebf1", fontSize: 11 }} />
                <Bar dataKey="processed" fill="#47a2b0" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="hil" fill="#b89dcb" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeading title="SLA / processing time" eyebrow="P95 latency by stage" />
          <div className="mt-6 space-y-5">
            {[
              ["Ingest", "0.8s", 22],
              ["Understand", "2.9s", 58],
              ["Extract", "1.7s", 43],
              ["Validate", "1.1s", 31],
              ["Deliver", "0.9s", 26],
            ].map(([label, value, width]) => (
              <div key={label}>
                <div className="mb-2 flex justify-between text-[10px]">
                  <span className="font-semibold text-slate-600">{label}</span>
                  <span className="font-mono text-slate-400">{value}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#47a2b0] to-[#37828e]" style={{ width: `${width}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-7 rounded-xl bg-[#ebf5f7] p-3 text-[10px] leading-relaxed text-[#2d6b75]">
            <CheckCircle2 size={14} className="mb-1" />
            98.6% of documents completed within the 30-second workspace SLA.
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <SectionHeading title="Cost per document" eyebrow="Blended processing cost" />
          <div className="mt-4 flex items-end gap-3">
            <div className="font-display text-4xl font-bold tracking-[-.05em] text-[#0e0e0e]">$0.10</div>
            <div className="mb-1 text-[10px] font-bold text-[#45bd8d]">↓ 8.7% vs prior period</div>
          </div>
          <div className="mt-6 h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsData} margin={{ top: 5, right: 0, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#47a2b0" stopOpacity={0.23} />
                    <stop offset="100%" stopColor="#47a2b0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" hide />
                <YAxis hide domain={[0, 0.18]} />
                <Area type="monotone" dataKey="failed" stroke="#47a2b0" strokeWidth={2} fill="url(#costFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <SectionHeading title="Cost by service / model" eyebrow="Demo snapshot · $482.60 estimated" />
          <div className="mt-4 space-y-4">
            {costData.map((cost) => (
              <div key={cost.label} className="flex items-center gap-3">
                <div className="w-[180px] shrink-0 truncate text-[10px] font-semibold text-slate-600">{cost.label}</div>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${cost.percent * 2.1}%`, background: cost.color }} />
                </div>
                <div className="w-12 text-right font-mono text-[10px] text-slate-500">${cost.value.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
            {[["AWS", "$338.50"], ["Compute", "$86.40"], ["Storage", "$33.20"]].map(([a, b]) => (
              <div key={a}>
                <div className="text-[9px] text-slate-400">{a}</div>
                <div className="mt-1 text-[13px] font-bold text-[#0e0e0e]">{b}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { isLive } = useSolution();

  if (isLive) {
    return <AnalyticsLive />;
  }

  return <MockAnalyticsDashboard />;
}
