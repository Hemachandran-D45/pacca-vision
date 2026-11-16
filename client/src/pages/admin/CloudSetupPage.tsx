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

type CloudProvider = "aws" | "azure";

export default function CloudSetupPage() {
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
    <div className="space-y-6 p-4 sm:p-7 lg:p-9 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      {/* Top Banner Header matching PACCA Light Design System */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">
            <Cloud size={14} className="text-[#47a2b0]" />
            Enterprise BYOC Accelerator · Cloud Architecture
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Customer-Hosted Cloud Pod Setup
          </h1>
          <p className="mt-1 text-xs text-slate-500 max-w-2xl">
            Configure PACCA Vision to execute inside the client&apos;s cloud boundary. Select your target cloud provider, inspect the data processing topology, and connect client resources.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestPing}
            disabled={pinging}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={13} className={cn(pinging && "animate-spin text-[#47a2b0]")} />
            Test Live Connection
          </button>
        </div>
      </div>

      {/* Cloud Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div
          onClick={() => setSelectedProvider("aws")}
          className={cn(
            "p-6 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between shadow-sm",
            selectedProvider === "aws"
              ? "border-[#e07a2c] bg-white ring-2 ring-[#e07a2c]/20"
              : "border-slate-200 bg-white hover:border-slate-300 hover:shadow"
          )}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-amber-50 text-[#b45309] border border-amber-200/60">
                AWS Native Cloud Pod
              </span>
              <div
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center transition-colors",
                  selectedProvider === "aws" ? "bg-[#e07a2c] text-white" : "border border-slate-300"
                )}
              >
                {selectedProvider === "aws" && <Check size={12} strokeWidth={3} />}
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Amazon Web Services (AWS)</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Amazon S3 Intake &rarr; <strong>Bedrock Data Automation (BDA Markdown)</strong> &rarr; Amazon Bedrock (Claude 3.5 Sonnet) &rarr; Amazon DynamoDB.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="font-semibold text-[#b45309]">S3</span> &bull; <span>BDA Markdown</span> &bull; <span>Claude 3.5</span> &bull; <span>DynamoDB</span>
          </div>
        </div>

        <div
          onClick={() => setSelectedProvider("azure")}
          className={cn(
            "p-6 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between shadow-sm",
            selectedProvider === "azure"
              ? "border-[#47a2b0] bg-white ring-2 ring-[#47a2b0]/20"
              : "border-slate-200 bg-white hover:border-slate-300 hover:shadow"
          )}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-teal-50 text-[#0f766e] border border-teal-200/60">
                Azure Native Cloud Pod
              </span>
              <div
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center transition-colors",
                  selectedProvider === "azure" ? "bg-[#47a2b0] text-white" : "border border-slate-300"
                )}
              >
                {selectedProvider === "azure" && <Check size={12} strokeWidth={3} />}
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Microsoft Azure</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Azure Blob Storage &rarr; Azure Content Understanding OCR &rarr; Azure OpenAI (GPT-4o) &rarr; Azure Cosmos DB.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="font-semibold text-[#0f766e]">Blob SAS</span> &bull; <span>Content Understanding</span> &bull; <span>Azure OpenAI</span> &bull; <span>Cosmos DB</span>
          </div>
        </div>
      </div>

      {/* Visual Pipeline Flowchart in Crisp Enterprise Style */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#45bd8d]" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Active Pipeline Topology ({selectedProvider.toUpperCase()} In-VPC Pod)
            </h4>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
            Zero External Data Transfer &bull; Client Tenant Boundary
          </span>
        </div>

        {selectedProvider === "aws" ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-1.5">
              <div className="flex items-center justify-between text-[#b45309]">
                <span className="text-[10px] font-bold uppercase tracking-wider">1. Inbound Storage</span>
                <Cloud size={14} />
              </div>
              <p className="font-bold text-slate-900 text-sm">Amazon S3</p>
              <p className="text-xs text-slate-600">Pre-signed direct upload URLs. Zero large-binary proxy.</p>
            </div>

            <div className="p-4 rounded-xl border border-amber-300/80 bg-amber-100/40 space-y-1.5">
              <div className="flex items-center justify-between text-[#b45309]">
                <span className="text-[10px] font-bold uppercase tracking-wider">2. Document Parser</span>
                <Sparkles size={14} />
              </div>
              <p className="font-bold text-slate-900 text-sm">Bedrock Data Automation (BDA)</p>
              <p className="text-xs text-slate-600">Transforms PDFs/scans to structured Markdown tables & reading flow.</p>
            </div>

            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-1.5">
              <div className="flex items-center justify-between text-[#b45309]">
                <span className="text-[10px] font-bold uppercase tracking-wider">3. Extraction AI</span>
                <Cpu size={14} />
              </div>
              <p className="font-bold text-slate-900 text-sm">Claude 3.5 Sonnet on Bedrock</p>
              <p className="text-xs text-slate-600">Extracts typed fields from Markdown with strict schema conformance.</p>
            </div>

            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-1.5">
              <div className="flex items-center justify-between text-[#b45309]">
                <span className="text-[10px] font-bold uppercase tracking-wider">4. Ledger & Review</span>
                <Database size={14} />
              </div>
              <p className="font-bold text-slate-900 text-sm">Amazon DynamoDB</p>
              <p className="text-xs text-slate-600">Stores document projections, audit trails, and review outcomes.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
            <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/40 space-y-1.5">
              <div className="flex items-center justify-between text-[#0f766e]">
                <span className="text-[10px] font-bold uppercase tracking-wider">1. Inbound Storage</span>
                <Cloud size={14} />
              </div>
              <p className="font-bold text-slate-900 text-sm">Azure Blob Storage</p>
              <p className="text-xs text-slate-600">15-minute SAS uploads directly to client storage container.</p>
            </div>

            <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/40 space-y-1.5">
              <div className="flex items-center justify-between text-[#0f766e]">
                <span className="text-[10px] font-bold uppercase tracking-wider">2. Document OCR</span>
                <Sparkles size={14} />
              </div>
              <p className="font-bold text-slate-900 text-sm">Content Understanding OCR</p>
              <p className="text-xs text-slate-600">High-resolution token extraction and polygon coordinate maps.</p>
            </div>

            <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/40 space-y-1.5">
              <div className="flex items-center justify-between text-[#0f766e]">
                <span className="text-[10px] font-bold uppercase tracking-wider">3. Extraction AI</span>
                <Cpu size={14} />
              </div>
              <p className="font-bold text-slate-900 text-sm">Azure OpenAI (GPT-4o)</p>
              <p className="text-xs text-slate-600">Extracts fields with Zero Data Retention (ZDR) verification.</p>
            </div>

            <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/40 space-y-1.5">
              <div className="flex items-center justify-between text-[#0f766e]">
                <span className="text-[10px] font-bold uppercase tracking-wider">4. Ledger & Review</span>
                <Database size={14} />
              </div>
              <p className="font-bold text-slate-900 text-sm">Azure Cosmos DB</p>
              <p className="text-xs text-slate-600">5-item document projection with ETag concurrency locks.</p>
            </div>
          </div>
        )}
      </div>

      {/* Configuration Form in High-Contrast Clean Slate */}
      <form onSubmit={handleSaveConfig} className="p-7 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {selectedProvider === "aws" ? "AWS Cloud Pod Resource Parameters" : "Azure Cloud Pod Resource Parameters"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure the resource names inside the client account. Updates active adapter registry and local environment.
            </p>
          </div>
        </div>

        {pingStatus && (
          <div
            className={cn(
              "p-3.5 rounded-xl border text-xs font-mono flex items-start gap-2.5",
              pingStatus.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-800"
            )}
          >
            {pingStatus.ok ? (
              <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
            )}
            <div className="space-y-0.5">
              <div className="font-bold">
                {pingStatus.ok ? "Connection Status: Verified" : "Connection Notice"}
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

        {selectedProvider === "aws" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">AWS Region</label>
              <input
                type="text"
                value={awsRegion}
                onChange={(e) => setAwsRegion(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0] outline-none transition"
                placeholder="us-east-1"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">S3 Inbound Bucket Name</label>
              <input
                type="text"
                value={s3Bucket}
                onChange={(e) => setS3Bucket(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0] outline-none transition"
                placeholder="client-claims-docs-in"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Bedrock Data Automation (BDA) Blueprint ARN
              </label>
              <input
                type="text"
                value={bdaBlueprintArn}
                onChange={(e) => setBdaBlueprintArn(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0] outline-none transition"
                placeholder="arn:aws:bedrock:us-east-1:123456789012:blueprint/healthcare-doc-v1"
              />
              <span className="text-[11px] text-slate-400">Generates clean Markdown tables directly from clinical documents</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Amazon Bedrock Model ID</label>
              <input
                type="text"
                value={bedrockModelId}
                onChange={(e) => setBedrockModelId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0] outline-none transition"
                placeholder="anthropic.claude-3-5-sonnet-20241022-v2:0"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Amazon DynamoDB Table Name</label>
              <input
                type="text"
                value={dynamoTable}
                onChange={(e) => setDynamoTable(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0] outline-none transition"
                placeholder="pacca_documents"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">AWS IAM Role / Access Key (Optional)</label>
              <input
                type="password"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0] outline-none transition"
                placeholder="Leave blank if using IAM Instance Profile / IRSA"
              />
              <span className="text-[11px] text-slate-400">Recommended: Use IAM role in customer VPC</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Azure Cosmos DB Endpoint</label>
              <input
                type="text"
                value={cosmosEndpoint}
                onChange={(e) => setCosmosEndpoint(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0] outline-none transition"
                placeholder="https://customer-cosmos.documents.azure.com:443/"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Storage Account Name</label>
              <input
                type="text"
                value={azureStorageAccount}
                onChange={(e) => setAzureStorageAccount(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0] outline-none transition"
                placeholder="customerstorageaccount"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Inbound Blob Container</label>
              <input
                type="text"
                value={docsContainer}
                onChange={(e) => setDocsContainer(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0] outline-none transition"
                placeholder="docs-in"
              />
            </div>
          </div>
        )}

        <div className="pt-4 flex items-center justify-between border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock size={14} className="text-slate-400" />
            <span>Credentials saved directly to customer environment (.env.local)</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#37828e] transition active:scale-95 disabled:opacity-50"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Save & Activate Cloud Pod
          </button>
        </div>
      </form>
    </div>
  );
}
