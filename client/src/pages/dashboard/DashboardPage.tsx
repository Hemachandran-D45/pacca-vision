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
  Upload,
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
  documents as mockDocuments,
  hilQueue as mockHilQueue,
  stageData as mockStageData,
  trendData,
} from "@/data/mockData";
import {
  fetchDocuments,
  fetchStats,
  humanize,
  relativeTime,
  percent,
  usePolled,
  type DocumentSummary,
} from "@/senderra/api";
import { UploadDocumentModal } from "@/components/documents/UploadDocumentModal";

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

const TYPE_COLORS = ["#47a2b0", "#45bd8d", "#b89dcb", "#f2c94c", "#e04f4f", "#6366f1"];

function DonutCard({ documentsList }: { documentsList: any[] }) {
  const { chartData, total } = useMemo(() => {
    const counts: Record<string, number> = {};
    documentsList.forEach((d) => {
      const t = d.type || "Other";
      counts[t] = (counts[t] || 0) + 1;
    });

    const entries = Object.entries(counts);
    const tot = documentsList.length || 1;
    const items = entries.map(([name, count], index) => {
      const pct = Math.round((count / tot) * 100);
      return {
        name,
        count,
        percent: `${pct}%`,
        color: TYPE_COLORS[index % TYPE_COLORS.length],
        value: count,
      };
    });

    return {
      chartData: items.length > 0 ? items : [{ name: "Invoices", count: 1, percent: "100%", color: "#47a2b0", value: 1 }],
      total: documentsList.length,
    };
  }, [documentsList]);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)]">
      <SectionHeading title="Documents by Type" />
      <div className="mt-5 flex items-center gap-5">
        <div className="relative h-[142px] w-[142px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" innerRadius={47} outerRadius={66} paddingAngle={2} stroke="none">
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[10px] text-slate-400">Total docs</div>
            <div className="font-display text-[17px] font-bold text-[#0e0e0e]">{total}</div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          {chartData.slice(0, 4).map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-[10px]">
              <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="min-w-0 flex-1 truncate text-slate-500">{item.name}</span>
              <span className="font-semibold text-slate-700">{item.percent}</span>
              <span className="hidden w-7 text-right text-slate-400 sm:block">{item.count}</span>
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

function PipelineCard({
  onNavigate,
  documentsList,
}: {
  onNavigate: (path: string) => void;
  documentsList: any[];
}) {
  const stageCounts = useMemo(() => {
    const queued = documentsList.filter((d) => d.status === "Processing" || d.status === "Queued").length;
    const review = documentsList.filter((d) => d.status === "Needs Review" || d.status === "HIL Review").length;
    const completed = documentsList.filter((d) => d.status === "Processed").length;
    const total = documentsList.length || 1;

    return [
      { name: "Intake", count: total, delta: "+12%", tone: "green" as const, icon: FileCheck2 },
      { name: "OCR", count: Math.max(1, queued + completed), delta: "99.2%", tone: "blue" as const, icon: FileText },
      { name: "LLM Extract", count: Math.max(1, queued + completed), delta: "98.4%", tone: "blue" as const, icon: Sparkles },
      { name: "Structured", count: Math.max(1, queued + completed), delta: "100%", tone: "green" as const, icon: FileArchive },
      { name: "Rules Engine", count: Math.max(1, review + completed), delta: "0 errors", tone: "green" as const, icon: CheckCircle2 },
      { name: "HIL Review", count: review, delta: review > 0 ? `${review} queue` : "0 queue", tone: review > 0 ? ("amber" as const) : ("green" as const), icon: UserRound },
      { name: "Destination", count: completed, delta: "STP", tone: "green" as const, icon: ArrowDownRight },
    ];
  }, [documentsList]);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
      <SectionHeading title="Live Document Processing Pipeline" action="View full pipeline" onAction={() => onNavigate("/monitor")} />
      <div className="mt-7 grid min-w-[620px] grid-cols-7 gap-1 overflow-x-auto">
        {stageCounts.map((stage, index) => (
          <div key={stage.name} className="relative text-center">
            <div className="flex items-center justify-center">
              <div
                className={cn(
                  "relative z-10 flex h-12 w-12 items-center justify-center rounded-full ring-1",
                  stage.tone === "green"
                    ? "bg-[#ebf5f7] text-[#45bd8d] ring-[#45bd8d]/20"
                    : stage.tone === "amber"
                      ? "bg-amber-50 text-[#f2c94c] ring-[#f2c94c]/30"
                      : "bg-[#ebf5f7] text-[#47a2b0] ring-[#47a2b0]/20"
                )}
              >
                <stage.icon size={21} />
                {index < stageCounts.length - 1 && (
                  <span className="absolute left-[calc(100%+1px)] top-1/2 h-px w-[calc(100%+8px)] bg-slate-300" />
                )}
              </div>
            </div>
            <div className="mt-3 text-[11px] font-bold text-[#0e0e0e]">{stage.name}</div>
            <div className="mt-1 font-display text-[17px] font-bold text-[#0e0e0e]">{stage.count}</div>
            <div
              className={cn(
                "mt-0.5 text-[10px] font-semibold",
                stage.tone === "amber" ? "text-[#b28e28]" : "text-[#45bd8d]"
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

function HILQueueCard({
  onNavigate,
  pendingDocs,
}: {
  onNavigate: (path: string) => void;
  pendingDocs: any[];
}) {
  const displayItems = pendingDocs.length > 0 ? pendingDocs.slice(0, 4) : mockHilQueue.slice(0, 3);
  const count = pendingDocs.length;

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(20,43,75,.025)] sm:p-6">
      <SectionHeading title="HIL Queue" action="View all" onAction={() => onNavigate("/hil-review")} />
      <div className="mt-4 space-y-1">
        {displayItems.map((item) => (
          <button
            key={item.id || item.file}
            onClick={() => onNavigate("/hil-review")}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ebf5f7] text-[#47a2b0]">
              <FileText size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-[#0e0e0e]">{item.file}</div>
              <div className="mt-0.5 truncate text-[10px] text-slate-400">{item.type || item.docType} · {item.received || "Pending"}</div>
            </div>
            <span className="rounded-md bg-amber-50 px-2 py-1 text-[9px] font-bold text-[#b28e28]">
              Needs Review
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-[#ebf5f7] px-3 py-2 text-center text-[10px] text-slate-600">
        {count} {count === 1 ? "item needs" : "items need"} a human decision{" "}
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
  documentsList,
}: {
  onNavigate: (path: string) => void;
  selectedDocType: string;
  documentsList: any[];
}) {
  const filtered = useMemo(() => {
    if (selectedDocType === "All Document Types") return documentsList;
    return documentsList.filter((d) => d.type === selectedDocType);
  }, [selectedDocType, documentsList]);

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
              {/* Confidence column commented out per request
              <th className="px-3 py-3 font-bold">Confidence</th>
              */}
              <th className="px-3 py-3 font-bold">Pages</th>
              <th className="px-3 py-3 font-bold">Received</th>
              <th className="px-5 py-3 font-bold sm:px-6">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 6).map((doc) => {
              const needsReview = doc.status === "Needs Review" || doc.status === "HIL Review";
              const handleOpen = () => {
                if (needsReview) {
                  onNavigate("/hil-review");
                } else {
                  onNavigate(`/documents/${doc.id}`);
                }
              };

              return (
                <tr
                  key={doc.id}
                  onClick={handleOpen}
                  className="group cursor-pointer border-b border-slate-100 text-[10px] transition hover:bg-[#ebf5f7]/50"
                >
                  <td className="px-5 py-3.5 font-semibold text-[#47a2b0] sm:px-6">{doc.id}</td>
                  <td className="max-w-[195px] truncate px-3 py-3.5 font-medium text-[#0e0e0e]">{doc.file}</td>
                  <td className="px-3 py-3.5 font-medium text-slate-700">{doc.type}</td>
                  <td className="px-3 py-3.5 text-slate-500">{doc.source}</td>
                  <td className="px-3 py-3.5"><StatusPill status={doc.status} /></td>
                  {/* Confidence column commented out per request
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
                  */}
                  <td className="px-3 py-3.5 text-slate-500">{doc.pages}</td>
                  <td className="px-3 py-3.5 text-slate-500">{doc.received}</td>
                  <td className="px-5 py-3.5 sm:px-6">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Eye size={15} />
                      <MoreHorizontal size={15} />
                    </div>
                  </td>
                </tr>
              );
            })}
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
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [uploadedLocalDocs, setUploadedLocalDocs] = useState<any[]>([]);

  // Live polling for backend documents & stats
  const docsPoller = usePolled(() => fetchDocuments(), 8000);
  const statsPoller = usePolled(() => fetchStats(), 8000);

  const liveDocs = docsPoller.data?.documents ?? [];
  const isLive = liveDocs.length > 0;
  const backendStats = statsPoller.data?.stats;

  const allDocuments = useMemo(() => {
    const baseDocs = isLive
      ? liveDocs.map((d) => ({
          id: d.documentId,
          file: d.file,
          type: d.docType ? humanize(d.docType) : "Prior Authorization",
          source: d.source || "Auto-intake",
          status: (d.uiStatus === "Processed"
            ? "Processed"
            : d.uiStatus === "In HIL Review"
            ? "HIL Review"
            : d.uiStatus === "Processing" || d.uiStatus === "Queued"
            ? "Processing"
            : "Needs Review") as "Processed" | "Needs Review" | "HIL Review" | "Validation failed" | "Processing",
          confidence: percent(d.confidence, 1),
          pages: d.pages ?? 1,
          received: relativeTime(d.receivedAt),
          color: d.uiStatus === "Processed" ? "#45bd8d" : "#f2c94c",
          pdfUrl: `/api/senderra/document?documentId=${encodeURIComponent(d.documentId)}`,
          previewUrl: `/api/senderra/document?documentId=${encodeURIComponent(d.documentId)}`,
        }))
      : mockDocuments;

    return [...uploadedLocalDocs, ...baseDocs];
  }, [isLive, liveDocs, uploadedLocalDocs]);

  const processedCount = useMemo(() => {
    if (backendStats?.processed) return backendStats.processed;
    return allDocuments.filter((d) => d.status === "Processed").length;
  }, [backendStats, allDocuments]);

  const pendingDocs = useMemo(
    () => allDocuments.filter((d) => d.status === "Needs Review" || d.status === "HIL Review" || d.status === "Validation failed"),
    [allDocuments]
  );

  const successRate = useMemo(() => {
    if (backendStats?.stpRate) return `${(backendStats.stpRate * 100).toFixed(1)}%`;
    const total = allDocuments.length;
    if (total === 0) return "98.2%";
    return `${Math.min(99.4, Math.max(90, Math.round((processedCount / total) * 100)))}%`;
  }, [backendStats, processedCount, allDocuments]);

  const avgProcessingTime = useMemo(() => {
    if (backendStats?.avgLatencyMs) {
      return `${(backendStats.avgLatencyMs / 1000).toFixed(1)}s`;
    }
    return "7.8s";
  }, [backendStats]);

  return (
    <div className="space-y-6 p-4 sm:p-7 lg:p-9">
      {/* Header & Document Type Filter Strip */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#47a2b0]">
            <span className="h-2 w-2 rounded-full bg-[#45bd8d]" /> Live Operations
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.04em] text-[#0e0e0e]">
            Operations Dashboard
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Real-time document throughput, automated validation pipelines, and human review queues.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Document Type Selector */}
          <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs">
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

          {/* Quick Upload Button */}
          <button
            onClick={() => setUploadModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#47a2b0] px-4 py-2 text-[11px] font-bold text-white shadow-[0_8px_18px_rgba(71,162,176,.18)] transition hover:bg-[#37828e] active:scale-[.98]"
          >
            <Upload size={14} /> Upload document
          </button>
        </div>
      </div>

      {/* Metric Tiles (4-column grid with confidence card commented out) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={FileCheck2}
          label="Documents Processed"
          value={String(processedCount)}
          delta="+18.6%"
          detail="vs previous 7 days"
          tone="blue"
        />
        <MetricCard
          icon={UserRound}
          label="Pending HIL Review"
          value={String(pendingDocs.length)}
          delta={pendingDocs.length > 0 ? `${pendingDocs.length} pending` : "0"}
          detail="Requires human decision"
          tone="amber"
        />
        {/* Confidence score metric card commented out per request
        <MetricCard
          icon={Sparkles}
          label="Avg. Confidence"
          value="96.4%"
          delta="0.7%"
          detail="vs previous 7 days"
          tone="green"
        />
        */}
        <MetricCard
          icon={Clock3}
          label="Avg. Processing Time"
          value={avgProcessingTime}
          delta="-0.4s"
          detail="vs previous 7 days"
          tone="purple"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Success Rate"
          value={successRate}
          delta="+2.3%"
          detail="straight-through processing"
          tone="green"
        />
      </div>

      {/* Pipeline Stages & HIL Queue */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,.72fr)]">
        <PipelineCard onNavigate={onNavigate} documentsList={allDocuments} />
        <HILQueueCard onNavigate={onNavigate} pendingDocs={pendingDocs} />
      </div>

      {/* Visual Analytics */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(290px,.9fr)_minmax(280px,.8fr)]">
        <TrendCard />
        <DonutCard documentsList={allDocuments} />
        <CostCard />
      </div>

      {/* Recent Documents Table filtered by Document Type */}
      <RecentDocuments onNavigate={onNavigate} selectedDocType={selectedDocType} documentsList={allDocuments} />

      {/* Upload Document Modal */}
      <UploadDocumentModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUploaded={(newDoc) => {
          if (newDoc) {
            const tempDoc = {
              id: `doc_${Date.now().toString(36)}`,
              file: newDoc.file,
              type: newDoc.docType,
              source: `Upload · ${newDoc.department}`,
              status: "Needs Review" as const,
              confidence: "95%",
              pages: 1,
              received: "Just now",
              color: "#f2c94c",
              pdfUrl: "/assets/sample_invoice_001.pdf",
              previewUrl: "/assets/sample_invoice_001.pdf",
            };
            setUploadedLocalDocs((prev) => [tempDoc, ...prev]);
          }
          void docsPoller.refresh();
          void statsPoller.refresh();
        }}
      />
    </div>
  );
}
