import { useState, useMemo } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileText,
  Filter,
  Layers,
  Percent,
  RefreshCw,
  Sliders,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AnalyticsLive } from "@/senderra/AnalyticsLive";
import { fetchDocuments, fetchStats, usePolled } from "@/senderra/api";

// ==========================================
// MTD EXECUTIVE DASHBOARD DATA (PAGE 1 OF PDF)
// ==========================================

const executiveVolumeData = [
  { month: "Apr", automated: 60000, review: 28000, total: 88000 },
  { month: "May", automated: 68000, review: 27000, total: 95000 },
  { month: "Jun", automated: 78000, review: 24000, total: 102000 },
  { month: "Jul", automated: 82000, review: 23000, total: 105000 },
  { month: "Aug", automated: 95000, review: 22000, total: 117000 },
  { month: "Sep", automated: 105714, review: 22736, total: 128450 },
];

const documentMixData = [
  { name: "Demographics", value: 53949, percent: 42, color: "#1e3a8a" },
  { name: "Rx Image", value: 30828, percent: 24, color: "#2563eb" },
  { name: "Lab Results", value: 20552, percent: 16, color: "#60a5fa" },
  { name: "Clinical Notes", value: 14130, percent: 11, color: "#f97316" },
  { name: "Insurance Card", value: 8991, percent: 7, color: "#64748b" },
];

const costSavingsTrendData = [
  { month: "Apr", savings: 128 },
  { month: "May", savings: 141 },
  { month: "Jun", savings: 152 },
  { month: "Jul", savings: 159 },
  { month: "Aug", savings: 171 },
  { month: "Sep", savings: 184 },
];

// ==========================================
// TECHNICAL PIPELINE DATA (PAGE 2 OF PDF)
// ==========================================

const stageLatencyData = [
  { stage: "Upload", seconds: 4, isBottleneck: false },
  { stage: "Classify", seconds: 9, isBottleneck: false },
  { stage: "Extract", seconds: 38, isBottleneck: false },
  { stage: "Validate", seconds: 12, isBottleneck: false },
  { stage: "Review", seconds: 165, isBottleneck: true },
  { stage: "Complete", seconds: 3, isBottleneck: false },
];

const confidenceHistogramData = [
  { bracket: "0.3", count: 14, isReview: true },
  { bracket: "0.4", count: 32, isReview: true },
  { bracket: "0.5", count: 68, isReview: true },
  { bracket: "0.6", count: 125, isReview: true },
  { bracket: "0.7", count: 240, isReview: true },
  { bracket: "0.8", count: 420, isReview: true },
  { bracket: "0.9", count: 585, isReview: false },
  { bracket: "1.0", count: 432, isReview: false },
];

const topExceptionsData = [
  { reason: "Low Confidence Field", count: 4820, pct: "38%" },
  { reason: "Missing Required Field", count: 3110, pct: "25%" },
  { reason: "Poor Scan Quality", count: 2340, pct: "19%" },
  { reason: "Doc Type Mismatch", count: 1290, pct: "10%" },
  { reason: "Business Rule Fail", count: 980, pct: "8%" },
];

const slaTrendData = [
  { day: "D-13", compliance: 91 },
  { day: "D-12", compliance: 92 },
  { day: "D-11", compliance: 90 },
  { day: "D-10", compliance: 93 },
  { day: "D-9", compliance: 95 },
  { day: "D-8", compliance: 94 },
  { day: "D-7", compliance: 96 },
  { day: "D-6", compliance: 95 },
  { day: "D-5", compliance: 97 },
  { day: "D-4", compliance: 96 },
  { day: "D-3", compliance: 95 },
  { day: "D-2", compliance: 97 },
  { day: "D-1", compliance: 98 },
  { day: "D0", compliance: 97 },
];

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<"executive" | "technical" | "live">("executive");
  const [timeRange, setTimeRange] = useState("mtd");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Live polling from Azure Cosmos DB to dynamically blend real telemetry
  const docsPoller = usePolled(() => fetchDocuments(), 12000);
  const statsPoller = usePolled(() => fetchStats(), 12000);

  const liveDocsCount = docsPoller.data?.documents?.length ?? 0;
  const liveStats = statsPoller.data?.stats;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([docsPoller.refresh(), statsPoller.refresh()]);
      toast.success("Intelligence analytics refreshed", {
        description: "Updated with latest operational metrics and telemetry.",
      });
    } catch {
      toast.error("Failed to refresh analytics");
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const handleDownloadReport = () => {
    const reportName =
      activeTab === "executive"
        ? "idp_executive_dashboard_sep_2026.csv"
        : "idp_technical_pipeline_diagnostics_sep_2026.csv";

    let csvContent = "";
    if (activeTab === "executive") {
      csvContent = [
        "Month,Automated (STP),Sent to Review,Total Volume,Cost Savings ($K)",
        ...executiveVolumeData.map(
          (r, i) => `${r.month},${r.automated},${r.review},${r.total},${costSavingsTrendData[i]?.savings || 0}`
        ),
      ].join("\r\n");
    } else {
      csvContent = [
        "Pipeline Stage,Duration Seconds,Bottleneck Flag",
        ...stageLatencyData.map((s) => `${s.stage},${s.seconds},${s.isBottleneck ? "YES" : "NO"}`),
        "",
        "Exception Reason,Incident Count,Share",
        ...topExceptionsData.map((e) => `"${e.reason}",${e.count},${e.pct}`),
      ].join("\r\n");
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = reportName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("Report downloaded", {
      description: `Saved report as ${reportName}`,
    });
  };

  return (
    <div className="space-y-6 p-4 sm:p-7 lg:p-9">
      {/* 1. TOP HEADER & NAVIGATION TABS */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#47a2b0]">
            <span className="h-2 w-2 rounded-full bg-[#45bd8d] animate-pulse" /> IDP Program Intelligence
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-[-0.03em] text-[#0e0e0e]">
            {activeTab === "executive"
              ? "IDP Program — Executive Dashboard"
              : activeTab === "technical"
              ? "IDP Pipeline — Technical Dashboard"
              : "Azure Infrastructure & Telemetry"}
          </h1>
          <p className="mt-1 text-[11px] text-slate-500">
            {activeTab === "executive"
              ? "Month to date: September 2026 · Refreshed daily · All figures vs. prior month"
              : activeTab === "technical"
              ? "Operational performance & quality · Last 24 hours refresh · Environment: Production"
              : "Raw container telemetry, token meters, and LLM orchestration telemetry from Azure Cosmos DB."}
          </p>
        </div>

        {/* CONTROLS: TABS & ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* TAB SWITCHER */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 shadow-2xs">
            <button
              onClick={() => setActiveTab("executive")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition",
                activeTab === "executive"
                  ? "bg-white text-[#0e0e0e] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <BarChart3 size={13} className={activeTab === "executive" ? "text-[#47a2b0]" : ""} />
              Executive ROI
            </button>
            <button
              onClick={() => setActiveTab("technical")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition",
                activeTab === "technical"
                  ? "bg-white text-[#0e0e0e] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Sliders size={13} className={activeTab === "technical" ? "text-[#47a2b0]" : ""} />
              Technical Diagnostics
            </button>
            <button
              onClick={() => setActiveTab("live")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition",
                activeTab === "live"
                  ? "bg-white text-[#0e0e0e] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Zap size={13} className={activeTab === "live" ? "text-amber-500" : ""} />
              Azure Live
            </button>
          </div>

          {/* DATE RANGE FILTER */}
          <div className="relative flex items-center">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none h-9 rounded-xl border border-slate-200 bg-white pl-3 pr-7 text-[11px] font-semibold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 shadow-2xs"
            >
              <option value="mtd">Month to date: Sep 2026</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last quarter</option>
              <option value="ytd">Year to date (2026)</option>
            </select>
          </div>

          {/* REFRESH BUTTON */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh analytics"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-2xs hover:bg-slate-50 transition active:scale-[0.95]"
          >
            <RefreshCw size={14} className={cn("transition", isRefreshing && "animate-spin text-[#47a2b0]")} />
          </button>

          {/* EXPORT REPORT */}
          <button
            onClick={handleDownloadReport}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-[0.98]"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* VIEW 1: EXECUTIVE DASHBOARD (PAGE 1 OF PDF)               */}
      {/* ========================================================= */}
      {activeTab === "executive" && (
        <div className="space-y-6">
          {/* TOP 4 EXECUTIVE KPI CARDS */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Card 1: Documents Processed (MTD) */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#47a2b0]" />
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">
                Documents Processed (MTD)
              </div>
              <div className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
                128,450
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#45bd8d]">
                <ArrowUpRight size={14} /> +9.4% vs prior month
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                Automated & manual intake · {liveDocsCount > 0 ? `${liveDocsCount} live Azure Cosmos faxes` : "Active stream"}
              </div>
            </div>

            {/* Card 2: Straight-Through Rate */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#10b981]" />
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">
                Straight-Through Rate (STP)
              </div>
              <div className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
                82.3%
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#45bd8d]">
                <ArrowUpRight size={14} /> +3.1 pts vs prior month
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                105,714 docs processed without human intervention
              </div>
            </div>

            {/* Card 3: Cost Savings (MTD) */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#0284c7]" />
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">
                Cost Savings (MTD)
              </div>
              <div className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
                $184.2K
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#45bd8d]">
                <ArrowUpRight size={14} /> +11.6% vs prior month
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                Calculated vs. baseline manual processing rate
              </div>
            </div>

            {/* Card 4: Human Hours Avoided */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#7c3aed]" />
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">
                Human Hours Avoided
              </div>
              <div className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
                6,150 hrs
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#7c3aed]">
                <Users size={14} /> ≈ 36 FTEs redeployed
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                Clinical & pharmacy staff reassigned to patient care
              </div>
            </div>
          </div>

          {/* MAIN CHARTS: VOLUME & MIX & SAVINGS */}
          <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            {/* LEFT: DOCUMENT VOLUME (STACKED AREA) */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-display text-[15px] font-bold text-[#0e0e0e]">
                    Document Volume — Automated vs. Manual Review
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    6-month operational scale & straight-through growth
                  </p>
                </div>
                <div className="flex items-center gap-4 text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-[#2563eb]" />
                    <span className="font-semibold text-slate-700">Automated (STP)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-[#f3b28b]" />
                    <span className="font-semibold text-slate-700">Sent to Review</span>
                  </span>
                </div>
              </div>

              <div className="mt-6 h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={executiveVolumeData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="automatedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.85} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.65} />
                      </linearGradient>
                      <linearGradient id="reviewGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f3b28b" stopOpacity={0.85} />
                        <stop offset="95%" stopColor="#f3b28b" stopOpacity={0.65} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickFormatter={(v) => `${v / 1000}k`}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 11, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                      formatter={(value: any, name: any) => [
                        `${Number(value).toLocaleString()} documents`,
                        name === "automated" ? "Automated (STP)" : "Sent to Review",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="automated"
                      stackId="1"
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      fill="url(#automatedGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="review"
                      stackId="1"
                      stroke="#ea580c"
                      strokeWidth={2}
                      fill="url(#reviewGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* RIGHT COLUMN: DOCUMENT MIX & COST SAVINGS */}
            <div className="space-y-6">
              {/* DOCUMENT MIX (DONUT) */}
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
                <h3 className="font-display text-[15px] font-bold text-[#0e0e0e]">
                  Document Mix (MTD)
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Intake distribution by clinical document classification
                </p>

                <div className="mt-4 flex flex-col items-center sm:flex-row sm:items-center sm:gap-6">
                  {/* DONUT */}
                  <div className="relative h-[170px] w-[170px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={documentMixData}
                          dataKey="value"
                          innerRadius={55}
                          outerRadius={78}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {documentMixData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <div className="font-display text-[18px] font-bold text-[#0e0e0e]">128.4K</div>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">docs</div>
                    </div>
                  </div>

                  {/* LEGEND */}
                  <div className="mt-4 sm:mt-0 flex-1 space-y-2 text-[11px]">
                    {documentMixData.map((d) => (
                      <div key={d.name} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-slate-600">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                          <span className="font-medium truncate">{d.name}</span>
                        </span>
                        <span className="font-bold text-slate-800">{d.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* COST SAVINGS TREND (BAR CHART) */}
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-[15px] font-bold text-[#0e0e0e]">
                      Cost Savings Trend ($K)
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Monthly operational dollars saved
                    </p>
                  </div>
                  <div className="text-[12px] font-bold text-[#f97316]">$184K (Sep)</div>
                </div>

                <div className="mt-4 h-[160px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costSavingsTrendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                      <Tooltip
                        contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 11 }}
                        formatter={(v: any) => [`$${v}K saved`, "Net Savings"]}
                      />
                      <Bar dataKey="savings" fill="#f97316" radius={[5, 5, 0, 0]} barSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          </div>

          {/* METHODOLOGY FOOTNOTE */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-[11px] text-slate-600 flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 font-bold text-[10px]">
              i
            </span>
            <span>
              <strong>Automated ROI Methodology:</strong> Automated docs avoid an average of 5.75 manual handling minutes each, valued at a fully-loaded healthcare operational rate ($32.50/hr blended clinical & intake staff).
            </span>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 2: TECHNICAL DASHBOARD (PAGE 2 OF PDF)               */}
      {/* ========================================================= */}
      {activeTab === "technical" && (
        <div className="space-y-6">
          {/* TOP 4 TECHNICAL KPI CARDS */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Card 1: Classification Accuracy */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#10b981]" />
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">
                  Classification Accuracy
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                  Target ≥ 95%
                </span>
              </div>
              <div className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
                96.8%
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#10b981]">
                <CheckCircle2 size={13} /> SLA Compliant (+1.8% over target)
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                Document type recognition & intake separation
              </div>
            </div>

            {/* Card 2: Extraction Accuracy */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#2563eb]" />
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">
                  Extraction Accuracy
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700 ring-1 ring-blue-200">
                  Target ≥ 93%
                </span>
              </div>
              <div className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
                94.2%
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#2563eb]">
                <CheckCircle2 size={13} /> SLA Compliant (+1.2% over target)
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                Field-level OCR & Azure Document Intelligence
              </div>
            </div>

            {/* Card 3: Avg Cycle Time */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#f59e0b]" />
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">
                Avg Cycle Time
              </div>
              <div className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
                4.2 min
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#10b981]">
                <ArrowDownRight size={14} /> -18 sec vs last week
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                End-to-end receipt to EHR delivery
              </div>
            </div>

            {/* Card 4: Exception Rate */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#8b5cf6]" />
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">
                Exception Rate
              </div>
              <div className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
                12.4%
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#10b981]">
                <ArrowDownRight size={14} /> -1.8 pts vs last week
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                Documents triggering human pharmacist review
              </div>
            </div>
          </div>

          {/* ROW 1: 3 TECHNICAL DIAGNOSTICS GRIDS */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* 1. AVG. TIME BY PIPELINE STAGE */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-display text-[14px] font-bold text-[#0e0e0e]">
                  Avg. Time by Pipeline Stage (sec)
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Execution duration per processing stage
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {stageLatencyData.map((item) => (
                  <div key={item.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700">{item.stage}</span>
                      <span className={cn("font-mono font-bold", item.isBottleneck ? "text-[#e0564c]" : "text-slate-600")}>
                        {item.seconds} s
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-md bg-slate-100 overflow-hidden">
                      <div
                        className={cn("h-full rounded-md transition-all duration-500", item.isBottleneck ? "bg-[#e0564c]" : "bg-[#2563eb]")}
                        style={{ width: `${Math.min(100, (item.seconds / 170) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl bg-amber-50/70 border border-amber-200/60 p-2.5 text-[10px] text-amber-900 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-amber-600" />
                <span>Human Review accounts for ~71% of total pipeline latency.</span>
              </div>
            </section>

            {/* 2. EXTRACTION CONFIDENCE DISTRIBUTION */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-display text-[14px] font-bold text-[#0e0e0e]">
                  Confidence Score Distribution
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Field population score vs. review threshold
                </p>
              </div>

              <div className="mt-4 h-[210px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={confidenceHistogramData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="bracket" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 11 }}
                      formatter={(v: any) => [`${v} fields`, "Field Count"]}
                    />
                    <ReferenceLine x="0.8" stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Threshold", fill: "#ef4444", fontSize: 9, position: "top" }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {confidenceHistogramData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.isReview ? "#3b82f6" : "#1d4ed8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-100 pt-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span>Review threshold: 0.82</span>
                </span>
                <span className="font-semibold text-slate-700">Peak: 0.90 bracket (585)</span>
              </div>
            </section>

            {/* 3. TOP EXCEPTION REASONS */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-display text-[14px] font-bold text-[#0e0e0e]">
                  Top Exception Reasons (MTD)
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Root causes for document review escalation
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {topExceptionsData.map((item) => (
                  <div key={item.reason} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700 truncate max-w-[190px]">
                        {item.reason}
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {item.count.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">({item.pct})</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-md bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-md bg-[#f97316] transition-all duration-500"
                        style={{ width: `${(item.count / 4820) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ROW 2: SLA COMPLIANCE TREND (14 DAYS) */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-display text-[15px] font-bold text-[#0e0e0e]">
                  SLA Compliance Trend — % Docs Completed Within Target Cycle Time
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Last 14 days compliance vs. 95% target threshold
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#10b981]" />
                  <span className="font-semibold text-slate-700">Actual Compliance</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 border-b border-dashed border-slate-400" />
                  <span className="font-semibold text-slate-500">Target 95%</span>
                </span>
              </div>
            </div>

            <div className="mt-6 h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={slaTrendData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis domain={[86, 100]} tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 11 }}
                    formatter={(v: any) => [`${v}% compliant`, "SLA Rate"]}
                  />
                  <ReferenceLine y={95} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "Target 95%", fill: "#64748b", fontSize: 10, position: "top" }} />
                  <Line
                    type="monotone"
                    dataKey="compliance"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#10b981" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 3: AZURE LIVE STREAM (CONTAINER RUNTIME)              */}
      {/* ========================================================= */}
      {activeTab === "live" && <AnalyticsLive />}
    </div>
  );
}
