import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  FileCode2,
  FileText,
  History as HistoryIcon,
  Layers,
  Pencil,
  Plus,
  Table as TableIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MetadataField = {
  name: string;
  type: "string" | "date" | "number" | "boolean";
  source: string;
  required: boolean;
  exportPath: string;
};

type SchemaContract = {
  key: string;
  name: string;
  department: string;
  version: string;
  updatedAt: string;
  fields: MetadataField[];
};

const DEFAULT_SCHEMAS: Record<string, SchemaContract> = {
  "prior-auth": {
    key: "prior-auth",
    name: "Prior Auth Packet",
    department: "Prior Authorization",
    version: "1.2",
    updatedAt: "05 Sep 2026",
    fields: [
      { name: "patient_name", type: "string", source: "Class A · Deterministic Anchor", required: true, exportPath: "patient.fullName" },
      { name: "patient_dob", type: "date", source: "Class A · Deterministic Anchor", required: true, exportPath: "patient.dateOfBirth" },
      { name: "member_id", type: "string", source: "Class A · Deterministic Anchor", required: true, exportPath: "insurance.memberId" },
      { name: "prescriber_npi", type: "string", source: "Class B · Context Derived", required: true, exportPath: "provider.npi" },
      { name: "primary_diagnosis_icd10", type: "string", source: "Class C · Model Inference", required: true, exportPath: "clinical.icd10" },
      { name: "medication_requested", type: "string", source: "Class A · Deterministic Anchor", required: true, exportPath: "rx.drugName" },
      { name: "prior_treatment_failure", type: "boolean", source: "Class D · Categorical", required: false, exportPath: "clinical.stepTherapyFail" },
    ],
  },
  "commercial-invoice": {
    key: "commercial-invoice",
    name: "Commercial Invoice",
    department: "Billing & Claims",
    version: "1.0",
    updatedAt: "01 Sep 2026",
    fields: [
      { name: "invoice_number", type: "string", source: "Class A · Deterministic Anchor", required: true, exportPath: "invoice.number" },
      { name: "invoice_date", type: "date", source: "Class A · Deterministic Anchor", required: true, exportPath: "invoice.date" },
      { name: "vendor_name", type: "string", source: "Class B · Context Derived", required: true, exportPath: "vendor.name" },
      { name: "subtotal_amount", type: "number", source: "Class A · Deterministic Anchor", required: true, exportPath: "financials.subtotal" },
      { name: "tax_amount", type: "number", source: "Class A · Deterministic Anchor", required: true, exportPath: "financials.tax" },
      { name: "total_amount", type: "number", source: "Class A · Deterministic Anchor", required: true, exportPath: "financials.total" },
      { name: "currency", type: "string", source: "Class D · Categorical", required: true, exportPath: "financials.currency" },
      { name: "purchase_order_number", type: "string", source: "Class A · Deterministic Anchor", required: false, exportPath: "invoice.poNumber" },
    ],
  },
  "prescription-intake": {
    key: "prescription-intake",
    name: "Prescription Intake",
    department: "Pharmacy Operations",
    version: "1.1",
    updatedAt: "02 Sep 2026",
    fields: [
      { name: "patient_name", type: "string", source: "Class A · Deterministic Anchor", required: true, exportPath: "patient.name" },
      { name: "drug_name", type: "string", source: "Class A · Deterministic Anchor", required: true, exportPath: "rx.drug" },
      { name: "dosage", type: "string", source: "Class B · Context Derived", required: true, exportPath: "rx.dosage" },
      { name: "refills_authorized", type: "number", source: "Class A · Deterministic Anchor", required: true, exportPath: "rx.refills" },
      { name: "prescriber_dea", type: "string", source: "Class B · Context Derived", required: false, exportPath: "provider.dea" },
    ],
  },
};

export default function MetadataStudioPage() {
  const [schemas, setSchemas] = useState<Record<string, SchemaContract>>(() => {
    try {
      const saved = localStorage.getItem("pacca_dynamic_schemas");
      return saved ? JSON.parse(saved) : DEFAULT_SCHEMAS;
    } catch {
      return DEFAULT_SCHEMAS;
    }
  });

  const [selectedSchemaKey, setSelectedSchemaKey] = useState<string>("commercial-invoice");
  const [viewMode, setViewMode] = useState<"table" | "json">("table");
  const [showHistory, setShowHistory] = useState(false);

  // Load additional dynamic document types from solutions
  useEffect(() => {
    async function loadSolutions() {
      try {
        const res = await fetch("/api/solutions-v2");
        const data = await res.json();
        if (data.types && Array.isArray(data.types)) {
          setSchemas((prev) => {
            const next = { ...prev };
            data.types.forEach((t: any) => {
              if (!next[t.key]) {
                next[t.key] = {
                  key: t.key,
                  name: t.name,
                  department: t.department || "Clinical Operations",
                  version: "1.0",
                  updatedAt: "Just now",
                  fields: (t.fields || []).map((f: any) => ({
                    name: f.name,
                    type: f.type || "string",
                    source: f.class === "B" ? "Class B · Context Derived" : f.class === "C" ? "Class C · Model Inference" : f.class === "D" ? "Class D · Categorical" : "Class A · Deterministic Anchor",
                    required: !!f.required,
                    exportPath: `payload.${t.key}.${f.name}`,
                  })),
                };
              }
            });
            return next;
          });
        }
      } catch {}
    }
    loadSolutions();
  }, []);

  // Add field dialog state
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<MetadataField["type"]>("string");
  const [newFieldSource, setNewFieldSource] = useState("Class A · Deterministic Anchor");
  const [newFieldRequired, setNewFieldRequired] = useState(true);
  const [fieldError, setFieldError] = useState("");

  const activeContract = schemas[selectedSchemaKey] || Object.values(schemas)[0];

  const handleAddField = () => {
    const trimmed = newFieldName.trim();
    if (!trimmed) {
      setFieldError("Field name is required.");
      return;
    }
    const newField: MetadataField = {
      name: trimmed,
      type: newFieldType,
      source: newFieldSource,
      required: newFieldRequired,
      exportPath: `contract.${activeContract.key}.${trimmed}`,
    };
    const updated = {
      ...schemas,
      [activeContract.key]: {
        ...activeContract,
        version: `${(parseFloat(activeContract.version) + 0.1).toFixed(1)}`,
        updatedAt: "Today",
        fields: [...activeContract.fields, newField],
      },
    };
    setSchemas(updated);
    try {
      localStorage.setItem("pacca_dynamic_schemas", JSON.stringify(updated));
    } catch {}
    setAddFieldOpen(false);
    setNewFieldName("");
    setFieldError("");
    toast.success(`Field "${trimmed}" added to ${activeContract.name} schema`);
  };

  const handleDeleteField = (fieldName: string) => {
    const updated = {
      ...schemas,
      [activeContract.key]: {
        ...activeContract,
        fields: activeContract.fields.filter((f) => f.name !== fieldName),
      },
    };
    setSchemas(updated);
    try {
      localStorage.setItem("pacca_dynamic_schemas", JSON.stringify(updated));
    } catch {}
    toast.success(`Field "${fieldName}" removed from schema`);
  };

  // Generate dynamic JSON Schema contract
  const jsonSchemaText = useMemo(() => {
    if (!activeContract) return "{}";
    const properties: Record<string, any> = {};
    const required: string[] = [];

    activeContract.fields.forEach((f) => {
      properties[f.name] = {
        type: f.type === "date" ? "string" : f.type,
        ...(f.type === "date" ? { format: "date" } : {}),
        description: `Extracted via ${f.source}`,
        "x-target-path": f.exportPath,
      };
      if (f.required) required.push(f.name);
    });

    const schemaObj = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: `${activeContract.name} Downstream Data Contract`,
      department: activeContract.department,
      version: `v${activeContract.version}`,
      lastModified: activeContract.updatedAt,
      type: "object",
      required,
      properties,
    };

    return JSON.stringify(schemaObj, null, 2);
  }, [activeContract]);

  const copySchemaToClipboard = () => {
    navigator.clipboard.writeText(jsonSchemaText);
    toast.success("JSON Schema Contract copied to clipboard!");
  };

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Configure</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">Metadata Studio</h2>
          <p className="mt-2 text-[11px] text-slate-500">
            Define and govern strict downstream metadata contracts consumed by client ERP, Snowflake, and EHR solutions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[10px] font-bold transition",
              showHistory ? "border-[#47a2b0]/40 bg-[#ebf5f7] text-[#47a2b0]" : "border-slate-200 bg-white text-slate-600"
            )}
          >
            <HistoryIcon size={14} /> Version history
          </button>
          <button
            onClick={() => toast.success(`Contract v${activeContract.version} published to Downstream Registry`)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e] shadow-sm transition"
          >
            <Check size={14} /> Publish contract
          </button>
        </div>
      </div>

      {showHistory && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#47a2b0]">Schema governance</div>
              <h3 className="mt-1 font-display text-lg font-bold text-[#0e0e0e]">Revisions · {activeContract?.name}</h3>
              <p className="mt-1 text-[10px] text-slate-500">Track how the data contract evolved across pipeline deployments.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {[
              [`${activeContract.version}`, "Current", "Suresh Kiran (Platform Admin)", "Today", "Updated extraction schema and field mapping."],
              ["1.0", "Published", "Maya Chen (Solution Dev)", "01 Sep 2026", "Initial enterprise release."],
            ].map(([version, status, author, date, note]) => (
              <div key={version} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white p-3">
                <div className="flex min-w-[76px] items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-[#0e0e0e]">v{version}</span>
                  <span className="rounded-md bg-[#ebf5f7] text-[#45bd8d] px-1.5 py-0.5 text-[8px] font-bold">{status}</span>
                </div>
                <div className="min-w-[150px] flex-1">
                  <div className="text-[10px] font-semibold text-[#0e0e0e]">{note}</div>
                  <div className="mt-0.5 text-[9px] text-slate-400">{author} · {date}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SCHEMA SELECTION BAR & TABS */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Document Type Selector */}
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pl-2">Contract:</span>
          <select
            value={selectedSchemaKey}
            onChange={(e) => setSelectedSchemaKey(e.target.value)}
            className="rounded-xl bg-slate-50 px-3 py-1.5 font-display text-[12px] font-bold text-[#0e0e0e] outline-none cursor-pointer"
          >
            {Object.values(schemas).map((s) => (
              <option key={s.key} value={s.key}>
                {s.name} ({s.department})
              </option>
            ))}
          </select>
        </div>

        {/* View Mode Toggle: Field Table vs Live JSON Schema */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-xs">
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-bold transition",
              viewMode === "table" ? "bg-[#47a2b0] text-white" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <TableIcon size={13} /> Field Table
          </button>
          <button
            onClick={() => setViewMode("json")}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-bold transition",
              viewMode === "json" ? "bg-[#47a2b0] text-white" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Code2 size={13} /> JSON Schema Spec
          </button>
        </div>
      </div>

      {/* MAIN CONTRACT WORKBENCH */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <SectionHeading
            title={`${activeContract.name} Specification`}
            eyebrow={`Version ${activeContract.version} · Owned by ${activeContract.department}`}
          />
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-[#ebf5f7] px-2.5 py-1.5 text-[9px] font-bold text-[#45bd8d]">
              {activeContract.fields.length} fields total
            </span>
            <span className="rounded-lg bg-[#ebf5f7] px-2.5 py-1.5 text-[9px] font-bold text-[#47a2b0]">
              {activeContract.fields.filter((f) => f.required).length} required
            </span>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[9px] font-bold text-slate-500">
              {activeContract.fields.filter((f) => !f.required).length} optional
            </span>
          </div>
        </div>

        {viewMode === "table" ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[9px] uppercase tracking-wider text-slate-400">
                  <th className="pb-3 font-bold">Field Name</th>
                  <th className="pb-3 font-bold">Data Type</th>
                  <th className="pb-3 font-bold">Extraction Classification</th>
                  <th className="pb-3 font-bold">Requirement</th>
                  <th className="pb-3 font-bold">Downstream JSON Target</th>
                  <th className="pb-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {activeContract.fields.map((field) => (
                  <tr key={field.name} className="border-b border-slate-100 text-[10px] hover:bg-[#ebf5f7]/30 transition">
                    <td className="py-3.5 font-mono font-bold text-[#47a2b0]">{field.name}</td>
                    <td className="py-3.5">
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700 capitalize">
                        {field.type}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-600 font-medium">{field.source}</td>
                    <td className="py-3.5">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[9px] font-bold",
                          field.required ? "bg-rose-50 text-[#e04f4f]" : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {field.required ? "Required" : "Optional"}
                      </span>
                    </td>
                    <td className="py-3.5 font-mono text-[9px] text-slate-500">{field.exportPath}</td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => handleDeleteField(field.name)}
                        title="Remove field"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setAddFieldOpen(true)}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#47a2b0] hover:text-[#37828e] transition"
              >
                <Plus size={14} /> Add metadata field
              </button>
              <span className="text-[9px] text-slate-400">Strict schema validation enabled</span>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                <FileCode2 size={13} className="text-[#47a2b0]" /> Live JSON Schema 2020-12 Specification
              </div>
              <button
                onClick={copySchemaToClipboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition"
              >
                <Copy size={12} /> Copy JSON
              </button>
            </div>
            <pre className="max-h-[440px] overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-teal-300">
              {jsonSchemaText}
            </pre>
          </div>
        )}
      </section>

      {/* ADD FIELD DIALOG */}
      <Dialog open={addFieldOpen} onOpenChange={setAddFieldOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold text-[#0e0e0e] flex items-center gap-2">
              <Plus size={18} className="text-[#47a2b0]" /> Add Metadata Field
            </DialogTitle>
            <DialogDescription className="text-[11px] text-slate-500">
              Add a new contract field to the {activeContract.name} downstream specification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold text-slate-500">
                Field Identifier <span className="text-rose-500 font-bold">*</span>
              </span>
              <input
                value={newFieldName}
                onChange={(e) => {
                  setNewFieldName(e.target.value);
                  if (fieldError) setFieldError("");
                }}
                placeholder="e.g. claim_sequence_id"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 font-mono text-[11px] text-slate-700 outline-none focus:border-[#47a2b0]"
                autoFocus
              />
              {fieldError && <p className="mt-1 text-[10px] font-semibold text-rose-600">{fieldError}</p>}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold text-slate-500">Data Type</span>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as MetadataField["type"])}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#47a2b0]"
                >
                  <option value="string">String (Text)</option>
                  <option value="number">Number / Currency</option>
                  <option value="date">Date (YYYY-MM-DD)</option>
                  <option value="boolean">Boolean (True/False)</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold text-slate-500">Extraction Source</span>
                <select
                  value={newFieldSource}
                  onChange={(e) => setNewFieldSource(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#47a2b0]"
                >
                  <option value="Class A · Deterministic Anchor">Class A · Anchor</option>
                  <option value="Class B · Context Derived">Class B · Context Derived</option>
                  <option value="Class C · Model Inference">Class C · Model Inference</option>
                  <option value="Class D · Categorical">Class D · Categorical</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={newFieldRequired}
                onChange={(e) => setNewFieldRequired(e.target.checked)}
                className="h-4 w-4 rounded accent-[#47a2b0]"
              />
              <span className="text-[11px] font-semibold text-slate-700">Required in downstream contract</span>
            </label>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => {
                setAddFieldOpen(false);
                setFieldError("");
              }}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddField}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#47a2b0] px-4 py-2 text-[10px] font-bold text-white hover:bg-[#37828e]"
            >
              <Check size={14} /> Add Field
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
