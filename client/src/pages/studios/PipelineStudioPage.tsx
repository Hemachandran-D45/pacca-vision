import { useState } from "react";
import {
  BrainCircuit,
  Check,
  CirclePlay,
  Code2,
  Columns3,
  GripVertical,
  Inbox,
  MoreHorizontal,
  Plus,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";

export default function PipelineStudioPage() {
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);
  const [connectorSaved, setConnectorSaved] = useState(true);
  const [connectorConfig, setConnectorConfig] = useState({
    inputConnector: "Amazon S3",
    inputIntegration: "Client 1 — Invoice Intake",
    inputBucket: "client-1-invoices",
    inputPath: "/incoming/",
    outputConnector: "Amazon S3",
    outputIntegration: "Client 1 — Invoice Output",
    outputBucket: "client-1-output",
    outputPath: "/processed/",
  });

  const nodes = [
    ["Document Intake", "Receive documents from configured source", Inbox, "blue"],
    ["Preprocess", "PACCA Standard", WandSparkles, "purple"],
    ["Understand / Classify", "PACCA Document Understanding", BrainCircuit, "teal"],
    ["Extract", "Uses Invoice Metadata v1.0", Columns3, "amber"],
    ["Validate", "Uses Invoice Validation Rules v1.0", ShieldCheck, "green"],
    ["HIL", "Conditional · confidence / validation exceptions", UserRound, "red"],
    ["Deliver", "Send final metadata to configured destination", Send, "blue"],
  ] as const;

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Configure</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">Pipeline Studio</h2>
          <p className="mt-2 text-[11px] text-slate-500">Compose the processing path. Keep inputs flexible, outputs predictable.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => toast("Preview started", { description: "Test data is moving through this draft pipeline." })}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
          >
            <CirclePlay size={14} /> Test run
          </button>
          <button
            onClick={() => toast.success("Pipeline saved", { description: "Draft v2.4 is ready for review." })}
            className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e]"
          >
            <Check size={14} /> Save draft
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <section className="min-h-[550px] rounded-2xl border border-slate-200/80 bg-[#f2f2f0] p-5 shadow-sm sm:p-7">
          <div className="mb-7 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
              <span className="h-2 w-2 rounded-full bg-[#45bd8d]" /> Draft · contract intelligence v2.4
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <button className="rounded-lg p-2 hover:bg-white"><Plus size={15} /></button>
              <button className="rounded-lg p-2 hover:bg-white"><SlidersHorizontal size={15} /></button>
              <button className="rounded-lg p-2 hover:bg-white"><MoreHorizontal size={15} /></button>
            </div>
          </div>

          <div className="mx-auto max-w-[720px] space-y-0">
            {nodes.map(([title, copy, Icon, tone], index) => (
              <button
                type="button"
                key={title}
                onClick={() => setSelectedNodeIndex(index)}
                className={cn("relative flex w-full items-center gap-4 rounded-2xl text-left transition", selectedNodeIndex === index ? "bg-[#ebf5f7]/80 ring-1 ring-[#47a2b0]/30" : "hover:bg-white/60")}
              >
                <div className="absolute left-[26px] top-[66px] h-[38px] w-px bg-slate-300" />
                {index < nodes.length - 1 && (
                  <div className="absolute left-[23px] top-[86px] z-10 border-x-4 border-t-4 border-x-transparent border-t-slate-300" />
                )}
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white bg-white text-[#47a2b0] shadow-[0_4px_12px_rgba(20,43,75,.08)]">
                  <Icon size={21} />
                </div>
                <div className="mb-2 flex flex-1 items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                  <div>
                    <div className="text-[12px] font-bold text-[#0e0e0e]">{title}</div>
                    <div className="mt-1 text-[10px] text-slate-400">{copy}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "hidden rounded-md px-2 py-1 text-[9px] font-bold sm:inline",
                        tone === "green"
                          ? "bg-[#ebf5f7] text-[#45bd8d]"
                          : tone === "amber"
                            ? "bg-amber-50 text-[#f2c94c]"
                            : tone === "purple"
                              ? "bg-[#ebf5f7] text-[#b89dcb]"
                              : "bg-[#ebf5f7] text-[#47a2b0]"
                      )}
                    >
                      {index === 5 ? "Output" : index === 4 ? "Gate" : "Step 0" + (index + 1)}
                    </span>
                    <GripVertical size={15} className="text-slate-300" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <SectionHeading
            title={selectedNodeIndex === 0 ? "Input connector" : selectedNodeIndex === 6 ? "Output connector" : "Pipeline settings"}
          />
          <p className="mt-1 text-[10px] text-slate-400">
            {selectedNodeIndex === 0
              ? "Configuration attached to Document Intake"
              : selectedNodeIndex === 6
                ? "Configuration attached to Deliver"
                : "Common PACCA logical processing stage"}
          </p>

          {(selectedNodeIndex === 0 || selectedNodeIndex === 6) && (
            <div className="mt-4 rounded-xl border border-[#47a2b0]/25 bg-[#47a2b0]/5 p-3">
              <div className="text-[9px] font-bold uppercase tracking-[.1em] text-[#47a2b0]">
                {selectedNodeIndex === 0 ? "Document Intake" : "Deliver"}
              </div>
              <div className="mt-3 space-y-2.5 text-[10px]">
                {(selectedNodeIndex === 0
                  ? [
                      ["Connector", "inputConnector"],
                      ["Integration", "inputIntegration"],
                      ["Bucket", "inputBucket"],
                      ["Path", "inputPath"],
                    ]
                  : [
                      ["Output connector", "outputConnector"],
                      ["Integration", "outputIntegration"],
                      ["Bucket", "outputBucket"],
                      ["Path", "outputPath"],
                    ]
                ).map(([label, key]) => (
                  <label key={key} className="block">
                    <span className="mb-1 block text-slate-400">{label}</span>
                    <input
                      value={connectorConfig[key as keyof typeof connectorConfig]}
                      onChange={(e) => {
                        setConnectorConfig({ ...connectorConfig, [key]: e.target.value });
                        setConnectorSaved(false);
                      }}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-[10px] font-semibold text-[#0e0e0e] outline-none focus:border-[#47a2b0]"
                    />
                  </label>
                ))}
                <button
                  onClick={() => {
                    setConnectorSaved(true);
                    toast.success("Connector changes saved");
                  }}
                  className={cn(
                    "mt-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[9px] font-bold transition-colors",
                    connectorSaved ? "bg-[#45bd8d]/15 text-[#45bd8d]" : "bg-[#47a2b0] text-white hover:bg-[#37828e]"
                  )}
                >
                  {connectorSaved ? "Saved" : "Save connector changes"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold text-slate-400">Pipeline name</span>
              <input defaultValue="Invoice Processing" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-[11px] outline-none focus:border-[#47a2b0]" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold text-slate-400">Version</span>
              <input defaultValue="2.4" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-[11px] outline-none focus:border-[#47a2b0]" />
            </label>
            <div className="border-t border-slate-100 pt-4">
              <div className="text-[10px] font-bold text-[#0e0e0e]">Output contract</div>
              <div className="mt-3 space-y-2">
                {["document_id", "document_type", "confidence", "validation_status", "entities[]"].map((field) => (
                  <div key={field} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[9px] text-slate-500">
                    <Code2 size={12} className="text-[#47a2b0]" />
                    {field}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => toast("Add node", { description: "Choose a connector, model, transform, or rule." })}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-[10px] font-bold text-slate-500 hover:border-[#47a2b0] hover:text-[#47a2b0] transition-colors"
            >
              <Plus size={14} /> Add step
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
