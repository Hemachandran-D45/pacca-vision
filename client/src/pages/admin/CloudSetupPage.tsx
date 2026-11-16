import React, { useState, useEffect } from "react";
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Database,
  Cpu,
  Layers,
  Sparkles,
  RefreshCw,
  Sliders,
  Check,
  Server,
  FileCode2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";

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
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="space-y-2">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          Enterprise BYOC Accelerator
        </span>
        <h1 className="text-2xl font-bold text-white tracking-tight">Customer-Hosted Cloud Setup & Architecture</h1>
        <p className="text-sm text-slate-400 max-w-3xl">
          Configure PACCA Vision to run directly inside the customer&apos;s cloud boundary. Select your target cloud, review the visual processing pipeline, and connect your resources.
        </p>
      </div>

      {/* Step 1: Provider Switcher Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          type="button"
          onClick={() => setSelectedProvider("aws")}
          className={cn(
            "p-6 rounded-2xl border-2 text-left transition-all duration-200 relative overflow-hidden flex flex-col justify-between",
            selectedProvider === "aws"
              ? "border-amber-500 bg-amber-500/5 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/20"
              : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
          )}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Recommended for AWS Native
              </span>
              {selectedProvider === "aws" && (
                <CheckCircle2 className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Amazon Web Services (AWS)</h3>
            <p className="text-sm text-slate-400 mb-4">
              Amazon S3 Intake &rarr; <strong>Bedrock Data Automation (BDA Markdown)</strong> &rarr; Amazon Bedrock (Claude 3.5 Sonnet) &rarr; DynamoDB.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-300/80 mt-2">
            <span>S3</span> &bull; <span>BDA Markdown</span> &bull; <span>Claude 3.5</span> &bull; <span>DynamoDB</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedProvider("azure")}
          className={cn(
            "p-6 rounded-2xl border-2 text-left transition-all duration-200 relative overflow-hidden flex flex-col justify-between",
            selectedProvider === "azure"
              ? "border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/20"
              : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
          )}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Enterprise Healthcare
              </span>
              {selectedProvider === "azure" && (
                <CheckCircle2 className="w-5 h-5 text-blue-400" />
              )}
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Microsoft Azure</h3>
            <p className="text-sm text-slate-400 mb-4">
              Azure Blob Storage &rarr; Azure Content Understanding OCR &rarr; Azure OpenAI (GPT-4o) &rarr; Cosmos DB.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-blue-300/80 mt-2">
            <span>Blob SAS</span> &bull; <span>Content Understanding</span> &bull; <span>Azure OpenAI</span> &bull; <span>Cosmos DB</span>
          </div>
        </button>
      </div>

      {/* Step 2: Visual Pipeline Flowchart */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" /> Active Cloud Pipeline Topology (Customer-Hosted Pod)
          </h4>
          <span className="text-xs text-slate-500 font-mono">100% In-VPC / Data Stays in Customer Cloud</span>
        </div>

        {selectedProvider === "aws" ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
              <div className="flex items-center justify-between text-amber-400">
                <span className="text-xs font-bold uppercase">1. Inbound Storage</span>
                <Cloud className="w-4 h-4" />
              </div>
              <p className="font-semibold text-white">Amazon S3</p>
              <p className="text-xs text-slate-400">Direct pre-signed upload URLs. Zero server upload bottlenecks.</p>
            </div>

            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2">
              <div className="flex items-center justify-between text-amber-400">
                <span className="text-xs font-bold uppercase">2. Document Parser</span>
                <Sparkles className="w-4 h-4" />
              </div>
              <p className="font-semibold text-white">Bedrock Data Automation (BDA)</p>
              <p className="text-xs text-slate-400">Converts PDFs/scans to structured Markdown tables & headers.</p>
            </div>

            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
              <div className="flex items-center justify-between text-amber-400">
                <span className="text-xs font-bold uppercase">3. Extraction AI</span>
                <Cpu className="w-4 h-4" />
              </div>
              <p className="font-semibold text-white">Claude 3.5 Sonnet on Bedrock</p>
              <p className="text-xs text-slate-400">Extracts typed fields from Markdown with strict JSON schema.</p>
            </div>

            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
              <div className="flex items-center justify-between text-amber-400">
                <span className="text-xs font-bold uppercase">4. Ledger & Review</span>
                <Database className="w-4 h-4" />
              </div>
              <p className="font-semibold text-white">Amazon DynamoDB</p>
              <p className="text-xs text-slate-400">Persists cases, audit trails, and HIL review provenance.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
              <div className="flex items-center justify-between text-blue-400">
                <span className="text-xs font-bold uppercase">1. Inbound Storage</span>
                <Cloud className="w-4 h-4" />
              </div>
              <p className="font-semibold text-white">Azure Blob Storage</p>
              <p className="text-xs text-slate-400">15-minute SAS uploads directly from browser to container.</p>
            </div>

            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
              <div className="flex items-center justify-between text-blue-400">
                <span className="text-xs font-bold uppercase">2. Document OCR</span>
                <Sparkles className="w-4 h-4" />
              </div>
              <p className="font-semibold text-white">Azure Content Understanding</p>
              <p className="text-xs text-slate-400">High-resolution OCR tokens, text lines, and polygon bounding boxes.</p>
            </div>

            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
              <div className="flex items-center justify-between text-blue-400">
                <span className="text-xs font-bold uppercase">3. Extraction AI</span>
                <Cpu className="w-4 h-4" />
              </div>
              <p className="font-semibold text-white">Azure OpenAI (GPT-4o)</p>
              <p className="text-xs text-slate-400">Schema extraction with Zero Data Retention (ZDR) compliance.</p>
            </div>

            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
              <div className="flex items-center justify-between text-blue-400">
                <span className="text-xs font-bold uppercase">4. Ledger & Review</span>
                <Database className="w-4 h-4" />
              </div>
              <p className="font-semibold text-white">Azure Cosmos DB</p>
              <p className="text-xs text-slate-400">5-item document projection with ETag optimistic concurrency.</p>
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Setup Configuration Form */}
      <form onSubmit={handleSaveConfig} className="p-8 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white">
              {selectedProvider === "aws" ? "AWS Environment Variables" : "Azure Environment Variables"}
            </h3>
            <p className="text-xs text-slate-400">
              Enter the cloud resource names. These will be persisted to your customer environment (.env.local / App Config).
            </p>
          </div>
          <button
            type="button"
            onClick={handleTestPing}
            disabled={pinging}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition"
          >
            {pinging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
            Test Live Connection
          </button>
        </div>

        {pingStatus && (
          <div
            className={cn(
              "p-4 rounded-xl border text-xs space-y-1 font-mono",
              pingStatus.ok
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            )}
          >
            <div className="font-bold flex items-center gap-1.5">
              {pingStatus.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {pingStatus.ok ? "Connected & Healthy" : "Connection Alert"}
            </div>
            {pingStatus.details && (
              <div>
                Storage: {pingStatus.details.storage} | Parser: {pingStatus.details.parser}
              </div>
            )}
            {pingStatus.error && <div>{pingStatus.error}</div>}
          </div>
        )}

        {selectedProvider === "aws" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">AWS Region</label>
              <input
                type="text"
                value={awsRegion}
                onChange={(e) => setAwsRegion(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-amber-500 outline-none"
                placeholder="us-east-1"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">S3 Inbound Bucket Name</label>
              <input
                type="text"
                value={s3Bucket}
                onChange={(e) => setS3Bucket(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-amber-500 outline-none"
                placeholder="client-claims-docs-in"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Bedrock Data Automation (BDA) Blueprint ARN
              </label>
              <input
                type="text"
                value={bdaBlueprintArn}
                onChange={(e) => setBdaBlueprintArn(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-amber-500 outline-none"
                placeholder="arn:aws:bedrock:us-east-1:123456789012:blueprint/healthcare-doc-v1"
              />
              <span className="text-[11px] text-slate-500">Generates clean Markdown tables from clinical files</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Amazon Bedrock Model ID</label>
              <input
                type="text"
                value={bedrockModelId}
                onChange={(e) => setBedrockModelId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-amber-500 outline-none"
                placeholder="anthropic.claude-3-5-sonnet-20241022-v2:0"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Amazon DynamoDB Table Name</label>
              <input
                type="text"
                value={dynamoTable}
                onChange={(e) => setDynamoTable(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-amber-500 outline-none"
                placeholder="pacca_documents"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">AWS IAM Role / Access Key ID (Optional)</label>
              <input
                type="password"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-amber-500 outline-none"
                placeholder="Leave blank if using IAM Instance Role / IRSA"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Azure Cosmos DB Endpoint</label>
              <input
                type="text"
                value={cosmosEndpoint}
                onChange={(e) => setCosmosEndpoint(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-blue-500 outline-none"
                placeholder="https://customer-cosmos.documents.azure.com:443/"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Storage Account Name</label>
              <input
                type="text"
                value={azureStorageAccount}
                onChange={(e) => setAzureStorageAccount(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-blue-500 outline-none"
                placeholder="customerstorageaccount"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Inbound Blob Container</label>
              <input
                type="text"
                value={docsContainer}
                onChange={(e) => setDocsContainer(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-blue-500 outline-none"
                placeholder="docs-in"
              />
            </div>
          </div>
        )}

        <div className="pt-4 flex items-center justify-between border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FileCode2 className="w-4 h-4 text-slate-500" />
            <span>Updates local .env.local and cloud provider adapter registry</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Save & Activate Cloud Pod
          </button>
        </div>
      </form>
    </div>
  );
}
