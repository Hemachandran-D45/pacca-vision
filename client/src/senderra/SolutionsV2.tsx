import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  FileCog,
  FileText,
  Filter,
  Layers,
  Loader2,
  Lock,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FieldType = "string" | "date" | "number" | "boolean";
type CatalogField = { name: string; type: FieldType; required: boolean; class?: string };
type CatalogType = {
  key: string;
  name: string;
  department?: string;
  guidance: string;
  fields: CatalogField[];
};

export const DEFAULT_DEPARTMENTS = [
  "Prior Authorization",
  "Billing & Claims",
  "Clinical Operations",
  "Pharmacy Operations",
  "Appeals & Compliance",
  "Patient Intake",
];

type CatalogResponse = {
  ok?: boolean;
  error?: string;
  types?: CatalogType[];
  warning?: string;
};
type SaveResponse = CatalogResponse & {
  paths?: string[];
  commitSha?: string;
  repository?: string;
  model?: string;
};

const FIELD_TYPES: FieldType[] = ["string", "date", "number", "boolean"];

const FIELD_CLASSES = [
  { value: "A", label: "Class A · Deterministic Anchor", short: "Anchor", desc: "Hard text / key-value pair in document" },
  { value: "B", label: "Class B · Context Derived", short: "Derived", desc: "Parsed or normalized from surrounding context" },
  { value: "C", label: "Class C · Model Inference", short: "Inference", desc: "LLM reasoning / unstructured contextual extraction" },
  { value: "D", label: "Class D · Categorical / Boolean", short: "Classify", desc: "Discrete option or presence detection" },
];

const GUIDANCE_PRESETS = [
  "Prioritize attending prescriber signature block",
  "Format all dates as YYYY-MM-DD",
  "Validate prescriber NPI is exactly 10 digits",
  "Extract NDC / drug code verbatim without rounding",
  "Flag as Needs Review if patient address is incomplete",
];

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return { error: "The server returned an unreadable response." } as T;
  }
}

export function SolutionsV2() {
  const [types, setTypes] = useState<CatalogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDepartment, setNewDepartment] = useState("Prior Authorization");
  const [newGuidance, setNewGuidance] = useState("");
  const [nameError, setNameError] = useState("");

  // Department filter
  const [selectedDepartment, setSelectedDepartment] = useState("All Departments");

  // Quick add field draft state
  const [draftField, setDraftField] = useState("");
  const [draftType, setDraftType] = useState<FieldType>("string");
  const [draftClass, setDraftClass] = useState("A");
  const [draftRequired, setDraftRequired] = useState(false);

  // Saving state
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [step, setStep] = useState("");
  const [localName, setLocalName] = useState("");
  const [localDepartment, setLocalDepartment] = useState("Prior Authorization");
  const [localGuidance, setLocalGuidance] = useState("");

  const applyTypes = (next: CatalogType[]) =>
    setTypes(next.map((item) => ({ ...item, guidance: item.guidance ?? "" })));

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/solutions-v2");
      const payload = await readJson<CatalogResponse>(response);
      if (!response.ok || payload.ok === false) {
        toast.error(payload.error || "Could not load catalog.");
        return;
      }
      const incoming = payload.types ?? [];
      applyTypes(incoming);
      if (!selectedKey && incoming.length > 0) {
        setSelectedKey(incoming[0].key);
        setLocalName(incoming[0].name);
        setLocalDepartment(incoming[0].department || "Prior Authorization");
        setLocalGuidance(incoming[0].guidance ?? "");
      } else if (selectedKey && !incoming.find((t) => t.key === selectedKey)) {
        setSelectedKey(incoming[0]?.key ?? null);
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    const selected = types.find((t) => t.key === selectedKey);
    if (selected) {
      setLocalName(selected.name);
      setLocalDepartment(selected.department || "Prior Authorization");
      setLocalGuidance(selected.guidance ?? "");
    }
  }, [selectedKey]);

  const persist = async (next: CatalogType[]) => {
    applyTypes(next);
    const response = await fetch("/api/solutions-v2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ types: next }),
    });
    const payload = await readJson<CatalogResponse>(response);
    if (!response.ok || payload.ok === false) {
      toast.error(payload.error || "Could not save changes.");
      await loadCatalog();
      return false;
    }
    applyTypes(payload.types ?? next);
    return true;
  };

  const selectType = (key: string) => {
    setSelectedKey(key);
    const found = types.find((t) => t.key === key);
    if (found) {
      setLocalName(found.name);
      setLocalDepartment(found.department || "Prior Authorization");
      setLocalGuidance(found.guidance ?? "");
    }
  };

  const createType = async () => {
    const name = newName.trim();
    if (!name) {
      setNameError("Enter a document type name.");
      return;
    }
    const key = name
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part, index) =>
        index === 0 ? part.toLowerCase() : part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase()
      )
      .join("");
    if (!key) {
      setNameError("Name must include letters.");
      return;
    }
    if (types.some((item) => item.key === key)) {
      setNameError("That document type already exists.");
      return;
    }
    const next = [
      ...types,
      {
        key,
        name,
        department: newDepartment.trim() || "Prior Authorization",
        guidance: newGuidance.trim(),
        fields: [],
      },
    ];
    const ok = await persist(next);
    if (!ok) return;
    setCreateOpen(false);
    setNewName("");
    setNewGuidance("");
    setNameError("");
    setSelectedKey(key);
    setLocalName(name);
    setLocalDepartment(newDepartment.trim() || "Prior Authorization");
    setLocalGuidance(newGuidance.trim());
    toast.success("Document type added", { description: "Configure fields, then Save to generate analyzer files." });
  };

  const addField = async () => {
    const name = draftField.trim();
    if (!name || !selectedKey) return;
    const selected = types.find((item) => item.key === selectedKey);
    if (!selected) return;
    if (selected.fields.some((field) => field.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Field already exists in this schema.");
      return;
    }
    const ok = await persist(
      types.map((item) =>
        item.key === selectedKey
          ? {
              ...item,
              fields: [
                ...item.fields,
                { name, type: draftType, required: draftRequired, class: draftClass },
              ],
            }
          : item
      )
    );
    if (ok) {
      setDraftField("");
      toast.success(`Field "${name}" added`);
    }
  };

  const updateField = async (index: number, changes: Partial<CatalogField>) => {
    if (!selectedKey) return;
    await persist(
      types.map((item) =>
        item.key === selectedKey
          ? {
              ...item,
              fields: item.fields.map((field, fieldIndex) =>
                fieldIndex === index ? { ...field, ...changes } : field
              ),
            }
          : item
      )
    );
  };

  const removeField = async (index: number) => {
    if (!selectedKey) return;
    const fieldName = selected?.fields[index]?.name;
    await persist(
      types.map((item) =>
        item.key === selectedKey
          ? { ...item, fields: item.fields.filter((_, fieldIndex) => fieldIndex !== index) }
          : item
      )
    );
    if (fieldName) {
      toast("Field removed", { description: `Removed ${fieldName} from schema.` });
    }
  };

  const updateLocalEdits = async () => {
    if (!selectedKey) return;
    await persist(
      types.map((item) =>
        item.key === selectedKey
          ? {
              ...item,
              name: localName.trim() || item.name,
              department: localDepartment.trim() || item.department || "Prior Authorization",
              guidance: localGuidance.trim(),
            }
          : item
      )
    );
  };

  const appendGuidancePreset = (preset: string) => {
    setLocalGuidance((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return preset;
      if (trimmed.includes(preset)) return prev;
      return `${trimmed}\n• ${preset}`;
    });
    setTimeout(() => void updateLocalEdits(), 50);
  };

  const deleteType = async (key: string) => {
    if (!window.confirm(`Delete "${key}"? This removes its schema and prompt files from the repo.`)) return;
    setSavingKey(key);
    setStep("Deleting...");
    try {
      const response = await fetch("/api/solutions-v2", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeKey: key }),
      });
      const payload = await readJson<CatalogResponse>(response);
      if (!response.ok || payload.ok === false) {
        toast.error(payload.error || "Could not delete.");
        return;
      }
      const remaining = payload.types ?? [];
      applyTypes(remaining);
      if (selectedKey === key) {
        setSelectedKey(remaining[0]?.key ?? null);
        if (remaining[0]) {
          setLocalName(remaining[0].name);
          setLocalDepartment(remaining[0].department || "Prior Authorization");
          setLocalGuidance(remaining[0].guidance ?? "");
        }
      }
      if (payload.warning) toast.error(payload.warning);
      else toast.success("Document type deleted.");
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSavingKey(null);
      setStep("");
    }
  };

  const saveType = async () => {
    if (!selectedKey) return;
    const selected = types.find((item) => item.key === selectedKey);
    if (!selected) return;
    if (!selected.fields.length) {
      toast.error("Add at least one field before saving.");
      return;
    }
    setSavingKey(selectedKey);
    setStep("Generating analyzer...");
    try {
      const response = await fetch("/api/solutions-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeKey: selectedKey }),
      });
      const payload = await readJson<SaveResponse>(response);
      if (!response.ok || payload.ok === false) {
        toast.error(payload.error || "Could not save.");
        return;
      }
      if (payload.types) applyTypes(payload.types);
      toast.success("Saved & analyzer generated", {
        description: payload.commitSha
          ? `Committed to ${payload.repository ?? "GitHub"} (${payload.commitSha.slice(0, 7)}).`
          : "Extraction schema and prompt updated.",
      });
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSavingKey(null);
      setStep("");
    }
  };

  const selected = types.find((t) => t.key === selectedKey);

  const availableDepartments = useMemo(() => {
    const set = new Set<string>();
    DEFAULT_DEPARTMENTS.forEach((d) => set.add(d));
    types.forEach((t) => {
      if (t.department) set.add(t.department);
    });
    return Array.from(set);
  }, [types]);

  const filteredTypes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return types.filter((t) => {
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        (t.department && t.department.toLowerCase().includes(q)) ||
        t.fields.some((f) => f.name.toLowerCase().includes(q));
      const matchesDept =
        selectedDepartment === "All Departments" ||
        (t.department || "Prior Authorization") === selectedDepartment;
      return matchesSearch && matchesDept;
    });
  }, [types, searchQuery, selectedDepartment]);

  const groupedByDepartment = useMemo(() => {
    const groups: Record<string, CatalogType[]> = {};
    filteredTypes.forEach((t) => {
      const dept = t.department || "Prior Authorization";
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(t);
    });
    return groups;
  }, [filteredTypes]);

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row gap-6 p-4 sm:p-7 lg:p-9">
      {/* LEFT SIDEBAR: Document Types Catalog */}
      <aside className="w-full lg:w-[280px] shrink-0 space-y-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#47a2b0]">Configure</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">Solutions</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Manage extraction schemas, validation gates, and AI guidance for automated processing.
          </p>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter document types..."
            className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[11px] text-slate-700 outline-none transition focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0]"
          />
        </div>

        {/* Department Filter Selector */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 shadow-xs">
          <Building2 size={13} className="text-[#47a2b0] shrink-0" />
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="w-full bg-transparent text-[11px] font-semibold text-slate-700 outline-none cursor-pointer"
          >
            <option value="All Departments">All Departments ({types.length})</option>
            {availableDepartments.map((dept) => {
              const count = types.filter((t) => (t.department || "Prior Authorization") === dept).length;
              return (
                <option key={dept} value={dept}>
                  {dept} ({count})
                </option>
              );
            })}
          </select>
        </div>

        {/* Document type list grouped by Department */}
        <div className="space-y-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-[11px] text-slate-400 flex items-center justify-center gap-2">
              <Loader2 size={15} className="animate-spin text-[#47a2b0]" /> Loading schemas...
            </div>
          ) : filteredTypes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-[11px] text-slate-400">
              No matching document types.
            </div>
          ) : (
            Object.entries(groupedByDepartment).map(([dept, deptTypes]) => (
              <div key={dept} className="space-y-1.5">
                <div className="flex items-center justify-between px-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 truncate">
                    <Building2 size={11} className="text-[#47a2b0]" /> {dept}
                  </span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                    {deptTypes.length}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {deptTypes.map((item) => {
                    const isSelected = selectedKey === item.key;
                    const reqCount = item.fields.filter((f) => f.required).length;

                    return (
                      <button
                        key={item.key}
                        onClick={() => selectType(item.key)}
                        className={cn(
                          "w-full rounded-2xl border p-3.5 text-left transition",
                          isSelected
                            ? "border-[#47a2b0]/40 bg-[#ebf5f7]/50 shadow-xs ring-1 ring-[#47a2b0]/30"
                            : "border-slate-200/80 bg-white hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                              isSelected ? "bg-[#47a2b0] text-white" : "bg-slate-100 text-slate-500"
                            )}
                          >
                            <FileCog size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-bold text-[#0e0e0e]">{item.name}</div>
                            <div className="mt-0.5 font-mono text-[9px] text-slate-400">{item.key}</div>
                          </div>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-semibold text-slate-600">
                            {item.fields.length} {item.fields.length === 1 ? "field" : "fields"}
                            {reqCount > 0 && (
                              <span className="ml-1 text-amber-700 font-bold">· {reqCount} req</span>
                            )}
                          </span>
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[8px] font-bold",
                              isSelected ? "bg-[#47a2b0] text-white" : "bg-slate-100 text-slate-600"
                            )}
                          >
                            {isSelected ? "Editing" : "Configured"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create button */}
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-[#37828e] transition"
        >
          <Plus size={15} /> Add document type
        </button>
      </aside>

      {/* RIGHT CONFIGURATION PANEL */}
      {selected ? (
        <main className="min-w-0 flex-1 space-y-5">
          {/* Header Action Strip */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#47a2b0]">
                Document type configuration
              </div>
              <div className="mt-1 flex items-center gap-2.5">
                <h3 className="font-display text-xl font-bold tracking-[-.04em] text-[#0e0e0e]">
                  {selected.name}
                </h3>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                  {selected.key}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => void deleteType(selected.key)}
                disabled={savingKey !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
              >
                <Trash2 size={13} /> Delete
              </button>
              <button
                onClick={() => void saveType()}
                disabled={savingKey !== null || selected.fields.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-[#37828e] transition disabled:opacity-50"
              >
                {savingKey === selected.key ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {savingKey === selected.key ? step || "Saving..." : "Save schema"}
              </button>
            </div>
          </div>

          {/* Document Type Name, Department & Schema Key */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Document type name
                </span>
                <input
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  onBlur={updateLocalEdits}
                  className="h-9 w-full rounded-xl border border-slate-200 px-3 text-[11px] font-semibold text-[#0e0e0e] outline-none transition focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0]"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Department
                </span>
                <select
                  value={localDepartment}
                  onChange={(e) => {
                    setLocalDepartment(e.target.value);
                    setTimeout(() => void updateLocalEdits(), 50);
                  }}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-[#0e0e0e] outline-none transition focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0]"
                >
                  {availableDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Schema key
                </span>
                <div className="relative">
                  <input
                    value={selected.key}
                    readOnly
                    className="h-9 w-full cursor-not-allowed rounded-xl border border-slate-100 bg-slate-50 pl-3 pr-8 font-mono text-[10px] font-semibold text-slate-500"
                  />
                  <Lock size={12} className="absolute right-3 top-2.5 text-slate-400" />
                </div>
              </label>
            </div>
          </section>

          {/* AI Guidance & Document Overview */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              {/* Guidance Textarea & Quick Prompt Presets */}
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <Sparkles size={12} className="text-[#47a2b0]" />
                  <span>AI Extraction Guidance &amp; Rules</span>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Domain instructions provided to the model when extracting metadata from this document type.
                </p>

                <textarea
                  value={localGuidance}
                  onChange={(e) => setLocalGuidance(e.target.value)}
                  onBlur={updateLocalEdits}
                  rows={4}
                  placeholder="e.g., Prioritize attending prescriber signature block. Format date as YYYY-MM-DD. Never hallucinate BIN/PCN..."
                  className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-[11px] leading-relaxed text-slate-700 outline-none transition focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0]"
                />

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {GUIDANCE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => appendGuidancePreset(preset)}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-[9px] font-semibold text-slate-600 hover:border-[#47a2b0] hover:bg-[#ebf5f7] hover:text-[#47a2b0] transition"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Document Type Info Stats */}
              <div className="flex flex-col justify-between border-t border-slate-100 pt-4 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Document Schema Health
                </div>

                <div className="my-auto space-y-2.5">
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-slate-400" />
                      <span className="text-[11px] font-medium text-slate-600">Total Extracted Fields</span>
                    </div>
                    <span className="font-display text-[15px] font-bold text-[#0e0e0e]">{selected.fields.length}</span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={14} className="text-[#45bd8d]" />
                      <span className="text-[11px] font-medium text-slate-600">Required Validation Gates</span>
                    </div>
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                      {selected.fields.filter((f) => f.required).length} required
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-[#47a2b0]" />
                      <span className="text-[11px] font-medium text-slate-600">Field Data Types</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-700">
                      {[...new Set(selected.fields.map((f) => f.type))].join(", ") || "string"}
                    </span>
                  </div>
                </div>

                <div className="text-[9px] text-slate-400">
                  Schemas are compiled into Azure Content Understanding analyzers upon save.
                </div>
              </div>
            </div>
          </section>

          {/* Output Schema Table */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#47a2b0]">
                  Output schema
                </div>
                <h3 className="mt-1 font-display text-lg font-bold text-[#0e0e0e]">
                  Fields extracted from each document
                </h3>
              </div>
              <span className="rounded-lg bg-[#47a2b0]/10 px-3 py-1.5 text-[10px] font-bold text-[#47a2b0]">
                {selected.fields.length} fields · {selected.fields.filter((f) => f.required).length} required
              </span>
            </div>

            {/* Compact, Sleek Enterprise Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[700px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Field name</th>
                    <th className="py-3 px-3">Data type</th>
                    <th className="py-3 px-3">Field Classification</th>
                    <th className="py-3 px-3">Validation</th>
                    <th className="py-3 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selected.fields.map((field, index) => (
                    <tr
                      key={field.name + "-" + index}
                      className="text-[11px] transition hover:bg-slate-50/60"
                    >
                      {/* Field Name */}
                      <td className="py-2 px-4">
                        <input
                          defaultValue={field.name}
                          onBlur={(e) => {
                            const name = e.target.value.trim();
                            if (!name || name === field.name) return;
                            void updateField(index, { name });
                          }}
                          className="h-8 w-full max-w-[240px] rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-[11px] font-semibold text-[#0e3d36] outline-none transition focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0]"
                        />
                      </td>

                      {/* Data Type */}
                      <td className="py-2 px-3">
                        <select
                          value={field.type}
                          onChange={(e) =>
                            void updateField(index, { type: e.target.value as FieldType })
                          }
                          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-700 outline-none focus:border-[#47a2b0]"
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Classification (Anchor / Derived / Inference) */}
                      <td className="py-2 px-3">
                        <select
                          value={field.class ?? "B"}
                          onChange={(e) =>
                            void updateField(index, { class: e.target.value })
                          }
                          className="h-8 w-full max-w-[210px] rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-700 outline-none focus:border-[#47a2b0]"
                        >
                          {FIELD_CLASSES.map((fc) => (
                            <option key={fc.value} value={fc.value} title={fc.desc}>
                              {fc.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Required Checkbox with Badge */}
                      <td className="py-2 px-3">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) =>
                              void updateField(index, { required: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-slate-300 text-[#47a2b0] focus:ring-[#47a2b0] accent-[#47a2b0] cursor-pointer"
                          />
                          <span
                            className={cn(
                              "text-[9px] font-bold rounded px-1.5 py-0.5",
                              field.required
                                ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                                : "text-slate-400"
                            )}
                          >
                            {field.required ? "Required" : "Optional"}
                          </span>
                        </label>
                      </td>

                      {/* Delete action */}
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => void removeField(index)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Remove field"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Quick Add Field Bar */}
            <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3">
              <input
                value={draftField}
                onChange={(e) => setDraftField(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addField()}
                placeholder="Add new field name (e.g. RxNumber, Refills)..."
                className="h-8 min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 font-mono text-[11px] text-[#0e0e0e] outline-none focus:border-[#47a2b0]"
              />

              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value as FieldType)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] text-slate-600 outline-none"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={draftClass}
                onChange={(e) => setDraftClass(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] text-slate-600 outline-none"
              >
                {FIELD_CLASSES.map((fc) => (
                  <option key={fc.value} value={fc.value}>{fc.short}</option>
                ))}
              </select>

              <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftRequired}
                  onChange={(e) => setDraftRequired(e.target.checked)}
                  className="accent-[#47a2b0]"
                />
                Required
              </label>

              <button
                onClick={() => void addField()}
                disabled={!draftField.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#47a2b0] px-3.5 py-1.5 text-[10px] font-bold text-white shadow-xs hover:bg-[#37828e] transition disabled:opacity-40"
              >
                <Plus size={13} /> Add Field
              </button>
            </div>
          </section>
        </main>
      ) : (
        <main className="flex min-w-0 flex-1 items-center justify-center">
          <div className="text-center p-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <FileText size={22} className="text-slate-400" />
            </div>
            <div className="text-[13px] font-bold text-slate-500">No document type selected</div>
            <div className="mt-1 text-[10px] text-slate-400">
              {types.length > 0 ? "Select a document type from the catalog on the left." : "Create one to get started."}
            </div>
          </div>
        </main>
      )}

      {/* Create document type dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (savingKey) return;
          setCreateOpen(open);
          if (!open) {
            setNewName("");
            setNewGuidance("");
            setNameError("");
          }
        }}
      >
        <DialogContent className="rounded-2xl border-slate-200 p-6 sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-.04em] text-[#0e0e0e]">
              Create document type
            </DialogTitle>
            <DialogDescription className="text-[11px] leading-relaxed text-slate-500">
              Name the document type and add model extraction guidance to calibrate the AI extractor.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold text-slate-500">
                Department <span className="text-rose-500 font-bold">*</span>
              </span>
              <select
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#47a2b0]"
              >
                {availableDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-[10px] font-bold text-slate-500">
                Document Type Name <span className="text-rose-500 font-bold">*</span>
              </span>
              <input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (nameError) setNameError("");
                }}
                placeholder="e.g. Prior Auth Packet"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[11px] text-slate-700 outline-none focus:border-[#47a2b0]"
              />
              {nameError ? (
                <p className="mt-2 text-[10px] font-semibold text-rose-600">{nameError}</p>
              ) : null}
            </label>
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-[10px] font-bold text-slate-500">
              Extraction Guidance &amp; Prioritization
            </span>
            <textarea
              value={newGuidance}
              onChange={(e) => setNewGuidance(e.target.value)}
              rows={4}
              placeholder="e.g. Prefer header member IDs. Dates as YYYY-MM-DD. Never invent BIN/PCN."
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] text-slate-700 outline-none focus:border-[#47a2b0]"
            />
          </label>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setNewName("");
                setNewGuidance("");
                setNameError("");
              }}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createType()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e]"
            >
              <Check size={14} /> Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
