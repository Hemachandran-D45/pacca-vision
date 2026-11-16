import React, { useState, useEffect } from "react";
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  Database,
  Cpu,
  Sparkles,
  RefreshCw,
  Check,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";

type CloudProvider = "aws" | "azure";

export function CloudPodSettings({ standalone = false }: { standalone?: boolean }) {
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider>("aws");
  const [loading, setLoading] = useState(false);
  const [pingStatus, setPingStatus] = useState<any>(null);
  const [pinging, setPinging] = useState(false);

  // AWS Configuration Form
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [s3Bucket, setS3Bucket] = useState("pacca-claims-docs-in");
  const [bdaBlueprintArn, setBdaBlueprintArn] = useState(
    "arn:aws:bedrock:us-east-1:123456789012:blueprint/healthcare-doc-v1"
  );
  const [bedrockModelId, setBedrockModelId] = useState(
    "anthropic.claude-3-5-sonnet-20241022-v2:0"
  );
  const [dynamoTable, setDynamoTable] = useState("pacca_documents");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");

  // Azure Configuration Form
  const [cosmosEndpoint, setCosmosEndpoint] = useState("");
  const [azureStorageAccount, setAzureStorageAccount] = useState("");
  const [docsContainer, setDocsContainer] = useState("docs-in");

  useEffect(() => {
    fetchCurrentConfig();
  }, []);

  const fetchCurrentConfig = async () => {
    try {
      const res = await fetch("/api/senderra/setup");
      if (res.ok) {
        const data = await res.json();
        if (data.currentProvider) {
          setSelectedProvider(data.currentProvider);
        }
        if (data.aws) {
          setAwsRegion(data.aws.region || "us-east-1");
          setS3Bucket(data.aws.s3Bucket || "pacca-claims-docs-in");
          setBdaBlueprintArn(data.aws.bdaBlueprintArn || "");
          setBedrockModelId(data.aws.bedrockModelId || "anthropic.claude-3-5-sonnet-20241022-v2:0");
          setDynamoTable(data.aws.dynamoTable || "pacca_documents");
        }
      }
    } catch {
      // ignore
    }
  };

  const handleTestPing = async () => {
    setPinging(true);
    setPingStatus(null);
    try {
      const res = await fetch("/api/senderra/setup/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedProvider }),
      });
      const data = await res.json();
      setPingStatus(data);
      if (res.ok && data.ok) {
        toast.success(`${selectedProvider.toUpperCase()} Cloud Pipeline Verified!`);
      } else {
        toast.error("Connectivity check returned warnings.");
      }
    } catch (e: any) {
      toast.error(`Connectivity check failed: ${e?.message || e}`);
    } finally {
      setPinging(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        provider: selectedProvider,
        awsConfig:
          selectedProvider === "aws"
            ? {
                region: awsRegion,
                s3Bucket,
                bdaBlueprintArn,
                bedrockModelId,
                dynamoTable,
                accessKeyId: accessKeyId.trim() || undefined,
                secretAccessKey: secretAccessKey.trim() || undefined,
              }
            : undefined,
        azureConfig:
          selectedProvider === "azure"
            ? {
                cosmosEndpoint,
                storageAccount: azureStorageAccount,
                docsContainer,
                cosmosKey: "",
                storageKey: "",
              }
            : undefined,
      };

      const res = await fetch("/api/senderra/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success(data.message || "Cloud configuration saved successfully!");
      } else {
        toast.error(data.error || "Failed to save configuration.");
      }
    } catch (err: any) {
      toast.error(`Error saving setup: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Header Card with Provider Switcher */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <SectionHeading
          title="Customer-Hosted Cloud Pod"
          eyebrow="Configure PACCA Vision to execute inside the client's AWS or Azure cloud boundary."
          action={pinging ? "Testing..." : "Test Connection"}
          onAction={handleTestPing}
        />

        {pingStatus && (
          <div
            className={cn(
              "mt-4 p-3.5 rounded-xl border text-xs flex items-start gap-2.5",
              pingStatus.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
            )}
          >
            {pingStatus.ok ? (
              <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            )}
            <div className="space-y-0.5">
              <div className="font-bold">
                {pingStatus.ok ? "Pipeline Verified" : "Connection Notice"}
              </div>
              {pingStatus.details && (
                <div className="text-[11px] opacity-90">
                  Storage: {pingStatus.details.storage} &bull; Parser: {pingStatus.details.parser}
                </div>
              )}
              {pingStatus.error && <div>{pingStatus.error}</div>}
            </div>
          </div>
        )}

        {/* Cloud Choice Cards */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => setSelectedProvider("aws")}
            className={cn(
              "p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between",
              selectedProvider === "aws"
                ? "border-[#e07a2c] bg-amber-50/30 ring-1 ring-[#e07a2c]"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
            )}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100/70 text-[#b45309]">
                  AWS Native
                </span>
                <div
                  className={cn(
                    "w-4 h-4 rounded-full flex items-center justify-center transition-colors",
                    selectedProvider === "aws" ? "bg-[#e07a2c] text-white" : "border border-slate-300"
                  )}
                >
                  {selectedProvider === "aws" && <Check size={10} strokeWidth={3} />}
                </div>
              </div>
              <h3 className="text-sm font-bold text-slate-900">Amazon Web Services (AWS)</h3>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                S3 Intake &bull; <strong>Bedrock Data Automation (BDA Markdown)</strong> &bull; Claude 3.5 Sonnet &bull; DynamoDB
              </p>
            </div>
          </div>

          <div
            onClick={() => setSelectedProvider("azure")}
            className={cn(
              "p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between",
              selectedProvider === "azure"
                ? "border-[#47a2b0] bg-teal-50/30 ring-1 ring-[#47a2b0]"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
            )}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-100/70 text-[#0f766e]">
                  Azure Native
                </span>
                <div
                  className={cn(
                    "w-4 h-4 rounded-full flex items-center justify-center transition-colors",
                    selectedProvider === "azure" ? "bg-[#47a2b0] text-white" : "border border-slate-300"
                  )}
                >
                  {selectedProvider === "azure" && <Check size={10} strokeWidth={3} />}
                </div>
              </div>
              <h3 className="text-sm font-bold text-slate-900">Microsoft Azure</h3>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                Blob SAS &bull; Content Understanding OCR &bull; Azure OpenAI (GPT-4o) &bull; Cosmos DB
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Visual Pipeline Flowchart */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#45bd8d]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Active Pipeline Topology ({selectedProvider.toUpperCase()})
            </span>
          </div>
          <span className="text-[10px] text-slate-500">
            Client Tenant VPC Boundary &bull; 0% Cross-Cloud Egress
          </span>
        </div>

        {selectedProvider === "aws" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/30 space-y-1">
              <div className="flex items-center justify-between text-[#b45309]">
                <span className="text-[9px] font-bold uppercase tracking-wider">1. Intake</span>
                <Cloud size={14} />
              </div>
              <div className="font-bold text-slate-900 text-xs">Amazon S3</div>
              <p className="text-[10px] text-slate-500">Direct pre-signed uploads</p>
            </div>

            <div className="p-3.5 rounded-xl border border-amber-300/80 bg-amber-100/40 space-y-1">
              <div className="flex items-center justify-between text-[#b45309]">
                <span className="text-[9px] font-bold uppercase tracking-wider">2. Parser</span>
                <Sparkles size={14} />
              </div>
              <div className="font-bold text-slate-900 text-xs">BDA Markdown</div>
              <p className="text-[10px] text-slate-500">Structured markdown tables</p>
            </div>

            <div className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/30 space-y-1">
              <div className="flex items-center justify-between text-[#b45309]">
                <span className="text-[9px] font-bold uppercase tracking-wider">3. AI Extractor</span>
                <Cpu size={14} />
              </div>
              <div className="font-bold text-slate-900 text-xs">Claude 3.5 Sonnet</div>
              <p className="text-[10px] text-slate-500">Bedrock schema extraction</p>
            </div>

            <div className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/30 space-y-1">
              <div className="flex items-center justify-between text-[#b45309]">
                <span className="text-[9px] font-bold uppercase tracking-wider">4. Ledger</span>
                <Database size={14} />
              </div>
              <div className="font-bold text-slate-900 text-xs">Amazon DynamoDB</div>
              <p className="text-[10px] text-slate-500">Document state & review</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-teal-200/80 bg-teal-50/30 space-y-1">
              <div className="flex items-center justify-between text-[#0f766e]">
                <span className="text-[9px] font-bold uppercase tracking-wider">1. Intake</span>
                <Cloud size={14} />
              </div>
              <div className="font-bold text-slate-900 text-xs">Azure Blob</div>
              <p className="text-[10px] text-slate-500">15-minute SAS upload</p>
            </div>

            <div className="p-3.5 rounded-xl border border-teal-200/80 bg-teal-50/30 space-y-1">
              <div className="flex items-center justify-between text-[#0f766e]">
                <span className="text-[9px] font-bold uppercase tracking-wider">2. OCR</span>
                <Sparkles size={14} />
              </div>
              <div className="font-bold text-slate-900 text-xs">Content Understanding</div>
              <p className="text-[10px] text-slate-500">Tokens & bounding boxes</p>
            </div>

            <div className="p-3.5 rounded-xl border border-teal-200/80 bg-teal-50/30 space-y-1">
              <div className="flex items-center justify-between text-[#0f766e]">
                <span className="text-[9px] font-bold uppercase tracking-wider">3. AI Extractor</span>
                <Cpu size={14} />
              </div>
              <div className="font-bold text-slate-900 text-xs">Azure OpenAI (GPT-4o)</div>
              <p className="text-[10px] text-slate-500">Zero Data Retention (ZDR)</p>
            </div>

            <div className="p-3.5 rounded-xl border border-teal-200/80 bg-teal-50/30 space-y-1">
              <div className="flex items-center justify-between text-[#0f766e]">
                <span className="text-[9px] font-bold uppercase tracking-wider">4. Ledger</span>
                <Database size={14} />
              </div>
              <div className="font-bold text-slate-900 text-xs">Azure Cosmos DB</div>
              <p className="text-[10px] text-slate-500">ETag concurrency lock</p>
            </div>
          </div>
        )}
      </section>

      {/* 3. Environment Parameters Form */}
      <form onSubmit={handleSaveConfig} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7 space-y-5">
        <SectionHeading
          title={selectedProvider === "aws" ? "AWS Resource Parameters" : "Azure Resource Parameters"}
          eyebrow="Configure client cloud resource names. Persisted directly to customer environment (.env.local)."
        />

        {selectedProvider === "aws" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">AWS Region</label>
              <input
                type="text"
                value={awsRegion}
                onChange={(e) => setAwsRegion(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:bg-white focus:border-[#47a2b0] outline-none"
                placeholder="us-east-1"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">S3 Inbound Bucket Name</label>
              <input
                type="text"
                value={s3Bucket}
                onChange={(e) => setS3Bucket(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:bg-white focus:border-[#47a2b0] outline-none"
                placeholder="client-claims-docs-in"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">
                Bedrock Data Automation (BDA) Blueprint ARN
              </label>
              <input
                type="text"
                value={bdaBlueprintArn}
                onChange={(e) => setBdaBlueprintArn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:bg-white focus:border-[#47a2b0] outline-none"
                placeholder="arn:aws:bedrock:us-east-1:123456789012:blueprint/healthcare-doc-v1"
              />
              <span className="text-[10px] text-slate-400">Extracts Markdown tables & flow directly from documents</span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">Amazon Bedrock Model ID</label>
              <input
                type="text"
                value={bedrockModelId}
                onChange={(e) => setBedrockModelId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:bg-white focus:border-[#47a2b0] outline-none"
                placeholder="anthropic.claude-3-5-sonnet-20241022-v2:0"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">Amazon DynamoDB Table Name</label>
              <input
                type="text"
                value={dynamoTable}
                onChange={(e) => setDynamoTable(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:bg-white focus:border-[#47a2b0] outline-none"
                placeholder="pacca_documents"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">AWS IAM Role / Access Key (Optional)</label>
              <input
                type="password"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:bg-white focus:border-[#47a2b0] outline-none"
                placeholder="Leave blank if using IAM Instance Profile / IRSA"
              />
              <span className="text-[10px] text-slate-400">Leave empty to use client VPC instance IAM profile</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">Azure Cosmos DB Endpoint</label>
              <input
                type="text"
                value={cosmosEndpoint}
                onChange={(e) => setCosmosEndpoint(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:bg-white focus:border-[#47a2b0] outline-none"
                placeholder="https://customer-cosmos.documents.azure.com:443/"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">Storage Account Name</label>
              <input
                type="text"
                value={azureStorageAccount}
                onChange={(e) => setAzureStorageAccount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:bg-white focus:border-[#47a2b0] outline-none"
                placeholder="customerstorageaccount"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">Inbound Blob Container</label>
              <input
                type="text"
                value={docsContainer}
                onChange={(e) => setDocsContainer(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:bg-white focus:border-[#47a2b0] outline-none"
                placeholder="docs-in"
              />
            </div>
          </div>
        )}

        <div className="pt-3 flex items-center justify-between border-t border-slate-100">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Lock size={13} className="text-slate-400" />
            <span>Updates local adapter registry and environment</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#37828e] transition active:scale-95 disabled:opacity-50"
          >
            {loading ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Save & Activate Cloud Pod
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CloudSetupPage() {
  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9 max-w-[1200px] mx-auto">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Administration</div>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">Cloud Pod Setup</h2>
        <p className="mt-2 text-[11px] text-slate-500">Configure customer cloud boundary parameters for AWS and Azure.</p>
      </div>
      <CloudPodSettings standalone />
    </div>
  );
}
