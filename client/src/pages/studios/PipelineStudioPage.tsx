import { useState } from "react";
import {
  BrainCircuit,
  Check,
  CirclePlay,
  Clock,
  Code2,
  Columns3,
  Cpu,
  Database,
  FileCheck2,
  GripVertical,
  Inbox,
  Layers,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  WandSparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";

type NodeConfig = {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  tone: "blue" | "purple" | "teal" | "amber" | "green" | "red";
  properties: Record<string, string | number | boolean>;
};

export default function PipelineStudioPage() {
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);
  const [isRunningSim, setIsRunningSim] = useState(false);
  const [simStep, setSimStep] = useState<number | null>(null);
  const [simResults, setSimResults] = useState<Record<string, unknown> | null>(null);

  const [nodes, setNodes] = useState<NodeConfig[]>([
    {
      id: "intake",
      title: "Universal Ingestion Gateway",
      subtitle: "Multi-channel intake (REST API, SFTP, Blob, Inbound Email)",
      icon: Inbox,
      tone: "blue",
      properties: {
        connectorType: "Azure Blob Storage / EventGrid",
        inboundContainer: "docs-in",
        supportedFormats: "PDF, TIFF, JPEG, PNG, DOCX",
        maxBatchSize: 50,
        virusScanEnabled: true,
      },
    },
    {
      id: "preprocess",
      title: "Pre-processing & Layout OCR",
      subtitle: "De-skew, layout extraction, bounding-box provenance",
      icon: WandSparkles,
      tone: "purple",
      properties: {
        engine: "Azure Content Understanding (2025-05-preview)",
        pageSplitting: "Auto-split multi-document packets",
        deSkew: true,
        ocrResolutionDpi: 300,
        handwritingDetection: true,
      },
    },
    {
      id: "classify",
      title: "Document Understanding & Classification",
      subtitle: "Multi-class probabilistic routing with fallback hierarchy",
      icon: BrainCircuit,
      tone: "teal",
      properties: {
        modelArchitecture: "PACCA Hybrid (Vector + Zero-Shot GPT-4o)",
        confidenceFloor: 0.85,
        targetTaxonomy: "Prior Auth, Clinical Note, Lab Report, Invoice",
        fallbackRoute: "ClassifiedOther -> Operator Triage",
      },
    },
    {
      id: "extract",
      title: "Intelligent Extraction Studio",
      subtitle: "Zod-validated schema extraction with token grounding",
      icon: Columns3,
      tone: "amber",
      properties: {
        activeSchema: "prior_authorization_v2",
        primaryLlm: "gpt-4o (Azure OpenAI eastus)",
        temperature: 0.0,
        enableChainOfGroundedThought: true,
        fieldConfidenceThreshold: 0.88,
      },
    },
    {
      id: "validate",
      title: "Cross-Document & Rule Engine",
      subtitle: "Deterministic business logic & reference codebooks",
      icon: ShieldCheck,
      tone: "green",
      properties: {
        npiRegistryValidation: true,
        icd10CrossCheck: true,
        serviceDateTemporalCheck: true,
        priorAuthRulebook: "CMS-0057-F Interoperability Rule",
        autoResolveGapsViaIvr: true,
      },
    },
    {
      id: "hil",
      title: "SLA-Driven Human Review (HIL)",
      subtitle: "Conditional routing for low confidence & policy exceptions",
      icon: UserRound,
      tone: "red",
      properties: {
        routingPolicy: "Confidence < 0.88 OR Validation Warning",
        targetQueue: "Prior_Auth_Level_1_Reviewers",
        slaTargetMinutes: 60,
        autoAssignMethod: "Skill-based Round Robin",
      },
    },
    {
      id: "deliver",
      title: "Enterprise Export & Delivery",
      subtitle: "Secure writeback, webhook notification, and EHR FHIR sync",
      icon: Send,
      tone: "blue",
      properties: {
        exportDestination: "Cosmos DB / EHR FHIR Bundle",
        blobDeliveryContainer: "docs-out",
        webhookEndpoint: "https://api.partner.health/v1/writeback",
        requireSignature: true,
      },
    },
  ]);

  const activeNode = nodes[selectedNodeIndex];

  const handleUpdateProperty = (key: string, value: string | number | boolean) => {
    setNodes((prev) =>
      prev.map((n, idx) =>
        idx === selectedNodeIndex
          ? { ...n, properties: { ...n.properties, [key]: value } }
          : n
      )
    );
  };

  const handleRunSimulation = async () => {
    setIsRunningSim(true);
    setSimResults(null);
    for (let i = 0; i < nodes.length; i++) {
      setSimStep(i);
      await new Promise((r) => setTimeout(r, 600));
    }
    setSimStep(null);
    setIsRunningSim(false);
    setSimResults({
      caseNumber: "CAS-SIM-948102",
      totalLatencyMs: 3840,
      fieldExtractionCount: 18,
      fieldScoreMean: 0.962,
      crossDocResult: "Passed (2 rules verified)",
      stpEligible: true,
      estimatedCostUsd: 0.0124,
    });
    toast.success("Pipeline simulation complete", {
      description: "Sample transaction processed through all 7 stages in 3.84s with 96.2% confidence.",
    });
  };

  return (
    <div className="space-y-6 p-4 sm:p-7 lg:p-9 max-w-[1600px] mx-auto">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">
            <Layers size={14} className="text-[#47a2b0]" />
            Pipeline Architecture Studio · PACCA V2.0
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Pipeline Studio & DAG Canvas
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Interactive intelligent document processing (IDP) DAG builder: configure connectors, layout OCR, extraction models, validation rules, and HIL routing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunSimulation}
            disabled={isRunningSim}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition active:scale-95 disabled:opacity-50"
          >
            <CirclePlay size={14} className={cn(isRunningSim && "animate-spin text-[#47a2b0]")} />
            {isRunningSim ? "Simulating DAG..." : "Execute Test Run"}
          </button>
          <button
            onClick={() => toast.success("Pipeline configuration saved to Cosmos DB", { description: "Version v2.0-prod committed." })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#47a2b0] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#37828e] transition active:scale-95"
          >
            <Check size={14} /> Commit Pipeline
          </button>
        </div>
      </div>

      {/* Simulation Result Banner if active */}
      {simResults && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Zap size={18} className="text-emerald-600" />
              <div>
                <h3 className="text-xs font-bold text-emerald-950">
                  Simulation Succeeded · STP Eligible Case {String(simResults.caseNumber)}
                </h3>
                <p className="text-[11px] text-emerald-800">
                  Total Latency: {Number(simResults.totalLatencyMs)}ms · Extracted {Number(simResults.fieldExtractionCount)} fields · Accuracy Mean: {Math.round(Number(simResults.fieldScoreMean) * 100)}% · Cost: ${Number(simResults.estimatedCostUsd)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSimResults(null)}
              className="text-xs font-semibold text-emerald-800 hover:text-emerald-950"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 2-Column Canvas + Node Inspector Layout */}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {/* Left: DAG Pipeline Canvas */}
        <section className="min-h-[620px] rounded-2xl border border-slate-200/80 bg-slate-50/70 p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between border-b border-slate-200/60 pb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Active DAG: <span className="font-bold text-slate-900">Healthcare_Prior_Auth_Production_v2</span>
            </div>
            <div className="text-[11px] text-slate-400">
              7 Sequential Processing Stages
            </div>
          </div>

          <div className="mx-auto max-w-[760px] space-y-4">
            {nodes.map((node, index) => {
              const isSelected = selectedNodeIndex === index;
              const isSimActive = simStep === index;
              const Icon = node.icon;

              return (
                <div key={node.id} className="relative">
                  {/* Vertical Connector Line */}
                  {index < nodes.length - 1 && (
                    <div className="absolute left-[31px] top-[72px] h-[36px] w-[2px] bg-slate-300 z-0" />
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedNodeIndex(index)}
                    className={cn(
                      "relative z-10 flex w-full items-center gap-4 rounded-2xl p-3.5 text-left transition-all duration-150 border",
                      isSelected
                        ? "bg-white border-[#47a2b0] shadow-md ring-2 ring-[#47a2b0]/20"
                        : "bg-white/90 border-slate-200 hover:bg-white hover:border-slate-300 shadow-xs",
                      isSimActive && "ring-4 ring-emerald-500/50 bg-emerald-50/50 border-emerald-500"
                    )}
                  >
                    {/* Node Icon Box */}
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-xs transition",
                        node.tone === "blue" && "bg-blue-50 text-blue-600",
                        node.tone === "purple" && "bg-purple-50 text-purple-600",
                        node.tone === "teal" && "bg-teal-50 text-teal-600",
                        node.tone === "amber" && "bg-amber-50 text-amber-600",
                        node.tone === "green" && "bg-emerald-50 text-emerald-600",
                        node.tone === "red" && "bg-rose-50 text-rose-600"
                      )}
                    >
                      <Icon size={22} className={cn(isSimActive && "animate-bounce")} />
                    </div>

                    {/* Node Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Stage 0{index + 1}
                        </span>
                        {isSimActive && (
                          <span className="rounded-md bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[9px] font-bold uppercase animate-pulse">
                            Processing
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-slate-900 truncate">{node.title}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">{node.subtitle}</div>
                    </div>

                    {/* Node Badge */}
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                        {node.id}
                      </span>
                      <GripVertical size={16} className="text-slate-300" />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right: Node Inspector Drawer */}
        <aside className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#47a2b0]">
              Stage 0{selectedNodeIndex + 1} Configuration
            </div>
            <h2 className="mt-1 font-display text-base font-bold text-slate-900">{activeNode.title}</h2>
            <p className="mt-1 text-xs text-slate-500">{activeNode.subtitle}</p>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-4">
            {Object.entries(activeNode.properties).map(([key, val]) => (
              <div key={key}>
                <label className="block text-[11px] font-bold text-slate-700 capitalize mb-1">
                  {key.replace(/([A-Z])/g, " $1")}
                </label>
                {typeof val === "boolean" ? (
                  <button
                    type="button"
                    onClick={() => handleUpdateProperty(key, !val)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition",
                      val ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600"
                    )}
                  >
                    <Check size={12} className={cn(!val && "opacity-0")} />
                    {val ? "Enabled" : "Disabled"}
                  </button>
                ) : typeof val === "number" ? (
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => handleUpdateProperty(key, Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs font-mono outline-none focus:border-[#47a2b0]"
                  />
                ) : (
                  <input
                    type="text"
                    value={String(val)}
                    onChange={(e) => handleUpdateProperty(key, e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs outline-none focus:border-[#47a2b0]"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-500">
            Changes made in the inspector are updated live in the current working draft.
          </div>
        </aside>
      </div>
    </div>
  );
}
