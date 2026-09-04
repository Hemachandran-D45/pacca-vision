import {
  ArrowDownRight,
  CheckCircle2,
  Clock3,
  Eye,
  FileArchive,
  FileCheck2,
  FileText,
  MoreHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionHeading } from "@/components/common/SectionHeading";
import { StatusPill } from "@/components/common/StatusPill";
import {
  DOCUMENT_TYPES,
  costData,
  documents,
  hilQueue,
  stageData,
  trendData,
} from "@/data/mockData";

function TrendCard() {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
      <div className="flex items-center justify-between">
        <SectionHeading title="Processing Trend" />
        <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-500 outline-none">
          <option>Last 7 days</option>
          <option>Last 30 days</option>
        </select>
      </div>
      <div className="mt-5 h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData} margin={{ top: 5, right: 4, left: -26, bottom: 0 }}>
            <defs>
              <linearGradient id="processedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#47a2b0" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#47a2b0" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="hilFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b89dcb" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#b89dcb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#edf1f5" />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#8b98a9" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#8b98a9" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6ebf1", fontSize: 11 }} />
            <Area type="monotone" dataKey="processed" stroke="#47a2b0" strokeWidth={2} fill="url(#processedFill)" />
            <Area type="monotone" dataKey="hil" stroke="#b89dcb" strokeWidth={2} fill="url(#hilFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#47a2b0]" />Processed</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#b89dcb]" />HIL Required</span>
      </div>
    </section>
  );
}

function DonutCard() {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
      <SectionHeading title="Documents by Type" />
      <div className="mt-5 flex items-center gap-5">
        <div className="relative h-[142px] w-[142px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={[{ value: 100 }]} dataKey="value" innerRadius={47} outerRadius={66} paddingAngle={2} stroke="none">
                <Cell fill="#47a2b0" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[10px] text-slate-400">Demo documents</div>
            <div className="font-display text-[17px] font-bold text-[#0e0e0e]">3</div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {[["Invoices", "100%", "3", "#47a2b0"]].map(([name, percent, count, color]) => (
            <div key={name} className="flex items-center gap-2 text-[10px]">
              <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
              <span className="min-w-0 flex-1 truncate text-slate-500">{name}</span>
              <span className="font-semibold text-slate-700">{percent}</span>
              <span className="hidden w-9 text-right text-slate-400 sm:block">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CostCard() {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
      <div className="flex items-center justify-between">
        <SectionHeading title="Cost Overview" />
        <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-500 outline-none">
          <option>By Service</option>
          <option>By Model</option>
        </select>
      </div>
      <div className="mt-3 text-[10px] text-slate-400">Estimated processing cost (USD)</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="font-display text-[27px] font-bold tracking-[-0.05em] text-[#0e0e0e]">$482.60</span>
        <span className="flex items-center text-[10px] font-bold text-[#45bd8d]">
          <ArrowDownRight size={12} /> 8.7%
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {costData.map((cost) => (
          <div key={cost.label}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[9px]">
              <span className="truncate text-slate-500">{cost.label}</span>
              <span className="shrink-0 text-slate-500">${cost.value.toFixed(2)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${cost.percent * 2.1}%`, background: cost.color }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PipelineCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
      <SectionHeading title="Live Document Processing Pipeline" action="View full pipeline" onAction={() => onNavigate("/monitor")} />
      <div className="mt-7 grid min-w-[620px] grid-cols-7 gap-1 overflow-x-auto">
        {stageData.map((stage, index) => (
          <div key={stage.name} className="relative text-center">
            <div className="flex items-center justify-center">
              <div
                className={cn(
                  "relative z-10 flex h-12 w-12 items-center justify-center rounded-full ring-1",
                  stage.tone === "green"
                    ? "bg-[#ebf5f7] text-[#45bd8d] ring-[#45bd8d]/20"
                    : stage.tone === "amber"
                      ? "bg-amber-50 text-[#f2c94c] ring-[#f2c94c]/30"
                      : stage.tone === "red"
                        ? "bg-rose-50 text-[#e04f4f] ring-[#e04f4f]/20"
                        : "bg-[#ebf5f7] text-[#47a2b0] ring-[#47a2b0]/20"
                )}
              >
                <stage.icon size={21} />
                {index < stageData.length - 1 && (
                  <span className="absolute left-[calc(100%+1px)] top-1/2 h-px w-[calc(100%+8px)] bg-slate-300" />
                )}
              </div>
            </div>
            <div className="mt-3 text-[11px] font-bold text-[#0e0e0e]">{stage.name}</div>
            <div className="mt-1 font-display text-[17px] font-bold text-[#0e0e0e]">{stage.count}</div>
            <div
              className={cn(
                "mt-0.5 text-[10px] font-semibold",
                stage.tone === "red"
                  ? "text-[#e04f4f]"
                  : stage.tone === "amber"
                    ? "text-[#b28e28]"
                    : stage.tone === "blue"
                      ? "text-[#47a2b0]"
                      : "text-[#45bd8d]"
              )}
            >
              {stage.delta}
            </div>
            <div className="mt-3 whitespace-nowrap text-[9px] text-slate-400">
              {index === 0
                ? "Source intake"
                : index === 1
                  ? "Representative OCR"
                  : index === 2
                    ? "Representative LLM"
                    : index === 3
                      ? "Structured output"
                      : index === 4
                        ? "Rules Engine"
                        : index === 5
                          ? "Human in Loop"
                          : "Destination"}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#45bd8d]" />Completed</span>
        <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#47a2b0]" />In Progress</span>
        <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#f2c94c]" />Attention</span>
        <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#b89dcb]" />Waiting</span>
      </div>
    </section>
  );
}

function HILQueueCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
      <SectionHeading title="HIL Queue" action="View all" onAction={() => onNavigate("/hil-review")} />
      <div className="mt-4 space-y-1">
        {hilQueue.map((item) => (
          <button
            key={item.file}
            onClick={() => onNavigate("/hil-review")}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ebf5f7] text-[#47a2b0]">
              <FileText size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-[#0e0e0e]">{item.patientOrVendor}</div>
              <div className="mt-0.5 truncate text-[10px] text-slate-400">{item.docType} · {item.age}</div>
            </div>
            <span
              className={cn(
                "rounded-md px-2 py-1 text-[9px] font-bold",
                item.priority === "High"
                  ? "bg-rose-50 text-[#e04f4f]"
                  : item.priority === "Medium"
                    ? "bg-amber-50 text-[#b28e28]"
                    : "bg-slate-100 text-slate-500"
              )}
            >
              {item.priority}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-[#ebf5f7] px-3 py-2 text-center text-[10px] text-slate-600">
        27 items need a human decision{" "}
        <button onClick={() => onNavigate("/hil-review")} className="ml-1 font-bold text-[#47a2b0] hover:text-[#37828e]">
          Open workbench
        </button>
      </div>
    </section>
  );
}

function RecentDocuments({
  onNavigate,
  selectedDocType,
}: {
  onNavigate: (path: string) => void;
  selectedDocType: string;
}) {
  const filtered = useMemo(() => {
    if (selectedDocType === "All Document Types") return documents;
    return documents.filter((d) => d.type === selectedDocType);
  }, [selectedDocType]);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(20,43,75,.025)]">
      <div className="p-5 sm:p-6">
        <SectionHeading
          title="Recent Documents"
          eyebrow={selectedDocType !== "All Document Types" ? `Filtered by ${selectedDocType}` : "Unified operational document queue"}
          action="View all"
          onAction={() => onNavigate("/documents")}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/70 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
              <th className="px-5 py-3 font-bold sm:px-6">Document ID</th>
              <th className="px-3 py-3 font-bold">File Name</th>
              <th className="px-3 py-3 font-bold">Document Type</th>
              <th className="px-3 py-3 font-bold">Source</th>
              <th className="px-3 py-3 font-bold">Status</th>
              <th className="px-3 py-3 font-bold">Confidence</th>
              <th className="px-3 py-3 font-bold">Pages</th>
              <th className="px-3 py-3 font-bold">Received</th>
              <th className="px-5 py-3 font-bold sm:px-6">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 6).map((doc) => (
              <tr
                key={doc.id}
                onClick={() => onNavigate(`/documents/${doc.id}`)}
                className="group cursor-pointer border-b border-slate-100 text-[10px] transition hover:bg-[#ebf5f7]/50"
              >
                <td className="px-5 py-3.5 font-semibold text-[#47a2b0] sm:px-6">{doc.id}</td>
                <td className="max-w-[195px] truncate px-3 py-3.5 font-medium text-[#0e0e0e]">{doc.file}</td>
                <td className="px-3 py-3.5 font-medium text-slate-700">{doc.type}</td>
                <td className="px-3 py-3.5 text-slate-500">{doc.source}</td>
                <td className="px-3 py-3.5"><StatusPill status={doc.status} /></td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-2 text-slate-600">
                    {doc.confidence !== "—" && (
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-[#45bd8d]" style={{ width: doc.confidence }} />
                      </span>
                    )}
                    {doc.confidence}
                  </div>
                </td>
                <td className="px-3 py-3.5 text-slate-500">{doc.pages}</td>
                <td className="px-3 py-3.5 text-slate-500">{doc.received}</td>
                <td className="px-5 py-3.5 sm:px-6">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Eye size={15} />
                    <MoreHorizontal size={15} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DashboardPage({
  onNavigate,
  onOpenDocument,
}: {
  onNavigate: (path: string) => void;
  onOpenDocument: (id: string) => void;
}) {
  const [selectedDocType, setSelectedDocType] = useState<string>("All Document Types");

  return (
    <div className="space-y-6 p-4 sm:p-7 lg:p-9">
      {/* Header & Document Type Filter Strip */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#47a2b0]">
            <span className="h-2 w-2 rounded-full bg-[#45bd8d]" /> Document Operations
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
            Operations Dashboard
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Real-time document throughput, automated extraction confidence, and human review queues.
          </p>
        </div>

        {/* Document Type Selector */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm">
          {DOCUMENT_TYPES.map((dt) => {
            const isSelected = selectedDocType === dt;
            return (
              <button
                key={dt}
                onClick={() => setSelectedDocType(dt)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all",
                  isSelected
                    ? "bg-[#47a2b0] text-white shadow-[0_2px_8px_rgba(71,162,176,0.3)]"
                    : "text-slate-600 hover:bg-slate-100/80"
                )}
              >
                {dt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Metric Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={FileCheck2}
          label="Documents Processed"
          value={selectedDocType === "Prior Authorization" ? "2,140" : selectedDocType === "Invoice" ? "1,830" : "4,812"}
          delta="18.6%"
          detail="vs previous 7 days"
          tone="blue"
        />
        <MetricCard
          icon={UserRound}
          label="Pending HIL Review"
          value={selectedDocType === "Prior Authorization" ? "14" : selectedDocType === "Invoice" ? "9" : "27"}
          delta="8"
          detail="vs previous 7 days"
          tone="amber"
        />
        <MetricCard
          icon={Sparkles}
          label="Avg. Confidence"
          value={selectedDocType === "Prior Authorization" ? "95.8%" : "96.4%"}
          delta="0.7%"
          detail="vs previous 7 days"
          tone="green"
        />
        <MetricCard
          icon={Clock3}
          label="Avg. Processing Time"
          value="8.2s"
          delta="1.4s"
          detail="vs previous 7 days"
          tone="purple"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Success Rate"
          value="97.8%"
          delta="2.3%"
          detail="vs previous 7 days"
          tone="green"
        />
      </div>

      {/* Pipeline Stages & HIL Queue */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,.72fr)]">
        <PipelineCard onNavigate={onNavigate} />
        <HILQueueCard onNavigate={onNavigate} />
      </div>

      {/* Visual Analytics */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(290px,.9fr)_minmax(280px,.8fr)]">
        <TrendCard />
        <DonutCard />
        <CostCard />
      </div>

      {/* Recent Documents Table filtered by Document Type */}
      <RecentDocuments onNavigate={onNavigate} selectedDocType={selectedDocType} />
    </div>
  );
}
