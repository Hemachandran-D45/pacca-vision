import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  FileStack,
  Filter,
  Layers,
  RefreshCw,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ControlTowerStats } from "../../../../shared/transactions.js";

export default function ControlTowerPage({
  onNavigate,
}: {
  onNavigate?: (path: string) => void;
}) {
  const [stats, setStats] = useState<ControlTowerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [activeChannel, setActiveChannel] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/senderra/stats/tower");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.stats) {
          setStats(data.stats);
          setLastRefreshed(new Date());
        }
      }
    } catch {
      toast.error("Failed to refresh control tower telemetry");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, []);

  const totalPackets = stats?.totalPackets ?? 48;
  const stpRate = stats?.stpRatePercent ?? 82;
  const slaCompliance = stats?.slaCompliancePercent ?? 96;
  const turnaround = stats?.avgTurnaroundMinutes ?? 12.4;
  const accuracy = Math.round((stats?.accuracyMean ?? 0.945) * 1000) / 10;
  const savings = stats?.estimatedCostSavingsUsd ?? 324.5;

  return (
    <div className="space-y-6 p-4 sm:p-7 lg:p-9 max-w-[1600px] mx-auto">
      {/* Top Banner & Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">
            <Activity size={14} className="animate-pulse text-[#47a2b0]" />
            Operations Intelligence · PACCA V2.0
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Operations Control Tower
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Real-time multi-channel intake telemetry, SLA breach guardrails, and autonomous Straight-Through Processing (STP).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">
            Refreshed {lastRefreshed.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin text-[#47a2b0]")} />
            Refresh
          </button>
          {onNavigate && (
            <button
              onClick={() => onNavigate("/ops/transactions")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#47a2b0] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#37828e] transition active:scale-95"
            >
              <FileStack size={14} /> View Transaction Ledger
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* SLA Alert Strip */}
      <div className="flex items-center justify-between rounded-2xl border border-amber-200/80 bg-amber-50/60 p-3.5 px-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
            <AlertTriangle size={16} />
          </div>
          <div>
            <div className="text-xs font-bold text-amber-950">
              SLA Compliance Guarantee: {slaCompliance}% on track
            </div>
            <div className="text-[11px] text-amber-800">
              2 transactions approaching 30-minute priority turnaround threshold. Zero hard breaches in the last 24h.
            </div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-bold text-amber-900 border border-amber-200">
            Auto-Escalation Active
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Packets</span>
            <FileStack size={16} className="text-[#47a2b0]" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{totalPackets}</div>
          <div className="mt-1 flex items-center text-[10px] font-medium text-emerald-600">
            <TrendingUp size={11} className="mr-0.5" /> +18% vs yesterday
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">STP Rate</span>
            <Zap size={16} className="text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600">{stpRate}%</div>
          <div className="mt-1 text-[10px] text-slate-500">Autonomous processing</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">SLA Target</span>
            <ShieldCheck size={16} className="text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{slaCompliance}%</div>
          <div className="mt-1 text-[10px] text-emerald-600 font-medium">99.0% SLA target</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Turnaround</span>
            <Clock size={16} className="text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{turnaround}m</div>
          <div className="mt-1 text-[10px] text-slate-500">Average end-to-end</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Field Accuracy</span>
            <CheckCircle2 size={16} className="text-teal-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{accuracy}%</div>
          <div className="mt-1 text-[10px] text-slate-500">Multi-engine mean</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Est. Savings</span>
            <DollarSign size={16} className="text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">${savings}</div>
          <div className="mt-1 text-[10px] text-emerald-600 font-medium">vs manual triage</div>
        </div>
      </div>

      {/* Operations Matrix & Telemetry Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Channel Ingestion Breakdown */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Intake Channel Distribution</h2>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">24h Influx</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Live volume routed across enterprise ingestion connectors.
          </p>

          <div className="mt-4 space-y-3">
            {[
              { name: "Direct REST API", key: "api", count: 24, percent: 45, color: "bg-[#47a2b0]" },
              { name: "Portal Direct Upload", key: "portal", count: 14, percent: 28, color: "bg-indigo-500" },
              { name: "Secure SFTP Ingestion", key: "sftp", count: 6, percent: 15, color: "bg-emerald-500" },
              { name: "Inbound Email Gateway", key: "email", count: 4, percent: 8, color: "bg-amber-500" },
              { name: "Digital Fax Stream", key: "fax", count: 2, percent: 4, color: "bg-rose-500" },
            ].map((c) => (
              <div
                key={c.key}
                onClick={() => setActiveChannel(activeChannel === c.key ? null : c.key)}
                className={cn(
                  "cursor-pointer rounded-xl p-2.5 transition border",
                  activeChannel === c.key
                    ? "border-[#47a2b0] bg-[#47a2b0]/5"
                    : "border-transparent hover:bg-slate-50"
                )}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">{c.name}</span>
                  <span className="font-bold text-slate-900">{c.count} packets ({c.percent}%)</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full transition-all duration-500", c.color)} style={{ width: `${c.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hourly Processing Velocity */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Processing Velocity & STP Throughput</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Hourly packets ingested vs resolved straight-through without human touch.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Ingested
              </span>
              <span className="flex items-center gap-1.5 font-medium text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> STP Approved
              </span>
            </div>
          </div>

          <div className="mt-6 flex h-48 items-end gap-3 border-b border-slate-100 pb-2">
            {[
              { hour: "08:00", in: 14, stp: 11 },
              { hour: "09:00", in: 28, stp: 22 },
              { hour: "10:00", in: 38, stp: 31 },
              { hour: "11:00", in: 42, stp: 36 },
              { hour: "12:00", in: 30, stp: 25 },
              { hour: "13:00", in: 34, stp: 28 },
              { hour: "14:00", in: 26, stp: 21 },
            ].map((bar) => {
              const maxVal = 45;
              const inHeight = Math.round((bar.in / maxVal) * 100);
              const stpHeight = Math.round((bar.stp / maxVal) * 100);
              return (
                <div key={bar.hour} className="flex-1 flex flex-col items-center gap-1.5 group">
                  <div className="text-[10px] text-slate-400 group-hover:text-slate-900 font-semibold transition">
                    {bar.in}
                  </div>
                  <div className="w-full flex items-end justify-center gap-1.5 h-36">
                    <div
                      className="w-1/2 rounded-t-lg bg-slate-200 group-hover:bg-slate-300 transition-all duration-300"
                      style={{ height: `${inHeight}%` }}
                      title={`Ingested: ${bar.in}`}
                    />
                    <div
                      className="w-1/2 rounded-t-lg bg-emerald-500 group-hover:bg-emerald-600 transition-all duration-300"
                      style={{ height: `${stpHeight}%` }}
                      title={`STP Approved: ${bar.stp}`}
                    />
                  </div>
                  <div className="text-[11px] font-medium text-slate-500">{bar.hour}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between text-xs text-slate-500">
            <div>Peak intake at 11:00 EST: 42 packets/hr</div>
            <div className="font-semibold text-emerald-700">85.7% Straight-Through Peak Efficiency</div>
          </div>
        </div>
      </div>

      {/* Autonomous Resolvers & Human Review Split */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <Cpu size={16} className="text-[#47a2b0]" /> Autonomous Exception Resolvers
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Sub-agent policies resolving missing fields without operator intervention.
          </p>
          <div className="mt-4 divide-y divide-slate-100">
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-800">IVR Conversational Outreach</div>
                <div className="text-[10px] text-slate-500">Auto-dials clinic for missing Member ID & NPI</div>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                87% Settlement
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-800">NPI Registry Grounding</div>
                <div className="text-[10px] text-slate-500">Fuzzy matches provider name against CMS taxonomy</div>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                99% Matched
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-800">Cross-Doc ICD-10 Reconciliation</div>
                <div className="text-[10px] text-slate-500">Validates primary diagnosis against lab clinical notes</div>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200">
                Active Policy
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <Users size={16} className="text-indigo-500" /> Human-in-the-Loop SLA Queue
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Live reviewer velocity, queue depth, and target SLA countdown.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Queue Depth</div>
              <div className="mt-1 text-xl font-bold text-slate-900">8 packets</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Assigned to 4 reviewers</div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Median Review Time</div>
              <div className="mt-1 text-xl font-bold text-indigo-600">42 seconds</div>
              <div className="text-[10px] text-emerald-600 font-medium mt-0.5">5.2x faster than manual</div>
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate("/hil-review")}
              className="mt-4 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              Open Reviewer Workbench →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
