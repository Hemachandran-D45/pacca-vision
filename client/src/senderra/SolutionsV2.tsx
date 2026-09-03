import { useEffect, useState } from "react";
import {
  Check,
  FileCog,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
  guidance: string;
  fields: CatalogField[];
};

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
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGuidance, setNewGuidance] = useState("");
  const [nameError, setNameError] = useState("");
  const [draftField, setDraftField] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [step, setStep] = useState("");
  const [localName, setLocalName] = useState("");
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
      if (selectedKey && !incoming.find((t) => t.key === selectedKey)) {
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
      setLocalGuidance(selected.guidance ?? "");
    }
  }, [selectedKey, types]);

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
    const next = [...types, { key, name, guidance: newGuidance.trim(), fields: [] }];
    const ok = await persist(next);
    if (!ok) return;
    setCreateOpen(false);
    setNewName("");
    setNewGuidance("");
    setNameError("");
    setSelectedKey(key);
    setLocalName(name);
    setLocalGuidance(newGuidance.trim());
    toast.success("Document type added", { description: "Configure fields, then Save to generate analyzer files." });
  };

  const addField = async () => {
    const name = draftField.trim();
    if (!name || !selectedKey) return;
    const selected = types.find((item) => item.key === selectedKey);
    if (!selected) return;
    if (selected.fields.some((field) => field.name === name)) {
      toast.error("Field already exists.");
      return;
    }
    const ok = await persist(
      types.map((item) =>
        item.key === selectedKey
          ? {
              ...item,
              fields: [...item.fields, { name, type: "string" as const, required: false }],
            }
          : item
      )
    );
    if (ok) setDraftField("");
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
    await persist(
      types.map((item) =>
        item.key === selectedKey
          ? { ...item, fields: item.fields.filter((_, fieldIndex) => fieldIndex !== index) }
          : item
      )
    );
  };

  const updateLocalEdits = async () => {
    if (!selectedKey) return;
    await persist(
      types.map((item) =>
        item.key === selectedKey
          ? { ...item, name: localName.trim() || item.name, guidance: localGuidance.trim() }
          : item
      )
    );
  };

  const deleteType = async (key: string) => {
    if (!window.confirm("Delete \"" + key + "\"? This removes its schema and prompt files from the repo.")) return;
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
    setStep("Saving...");
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
      toast.success("Saved and committed", {
        description: payload.commitSha
          ? "Committed to " + (payload.repository ?? "GitHub") + " (" + payload.commitSha.slice(0, 7) + ")."
          : "Analyzer files updated.",
      });
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSavingKey(null);
      setStep("");
    }
  };

  const selected = types.find((t) => t.key === selectedKey);

  return (
    <div className="flex h-full min-h-0 gap-0 p-4 sm:p-7 lg:p-9">
      {/* LEFT SIDEBAR */}
      <aside className="w-[260px] shrink-0 space-y-3 pr-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.15em] text-blue-600">Configure</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#142b4b]">Solutions</h2>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Document types from field_meta.json. Save generates and commits analyzer files.
          </p>
        </div>

        {/* Document type list */}
        <div className="space-y-2">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-[11px] text-slate-400">
              Loading...
            </div>
          ) : types.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-[10px] text-slate-400">
              No document types yet.
            </div>
          ) : (
            types.map((item) => (
              <button
                key={item.key}
                onClick={() => selectType(item.key)}
                className={
                  "w-full rounded-2xl border p-4 text-left transition " +
                  (selectedKey === item.key
                    ? "border-blue-200 bg-blue-50/60 shadow-sm"
                    : "border-slate-200/80 bg-white hover:border-blue-100")
                }
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: selectedKey === item.key ? "#156bc916" : "#f1f5f9",
                      color: selectedKey === item.key ? "#156bc9" : "#64748b",
                    }}
                  >
                    <FileCog size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-bold text-[#142b4b]">{item.name}</div>
                    <div className="mt-0.5 font-mono text-[8px] text-slate-400">{item.key}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-[9px] text-slate-400">
                  <span>{item.fields.length} fields</span>
                  <span
                    className={
                      "rounded-md px-1.5 py-0.5 font-bold " +
                      (selectedKey === item.key ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {selectedKey === item.key ? "Editing" : "Configured"}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Create button */}
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex w-full items-center gap-2 rounded-xl bg-[#156bc9] px-4 py-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-[#0d5aae]"
        >
          <Plus size={15} /> Add document type
        </button>
      </aside>

      {/* RIGHT CONFIGURATION PANEL */}
      {selected ? (
        <main className="min-w-0 flex-1 space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.14em] text-blue-600">
                Document type configuration
              </div>
              <h3 className="mt-1 font-display text-lg font-bold text-[#142b4b]">{selected.name}</h3>
              <div className="mt-1 font-mono text-[9px] text-slate-400">{selected.key}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void deleteType(selected.key)}
                disabled={savingKey !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700 disabled:opacity-50"
              >
                <Trash2 size={13} /> Delete
              </button>
              <button
                onClick={() => void saveType()}
                disabled={savingKey !== null || selected.fields.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-[#156bc9] px-4 py-2 text-[11px] font-bold text-white disabled:opacity-50"
              >
                {savingKey === selected.key ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {savingKey === selected.key ? step || "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {/* Name + Schema Key */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Document type name
                </span>
                <input
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  onBlur={updateLocalEdits}
                  className="h-9 w-full rounded-xl border border-slate-200 px-3 text-[11px] font-semibold text-[#142b4b] outline-none focus:border-blue-400"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Schema key
                </span>
                <input
                  value={selected.key}
                  readOnly
                  className="h-9 w-full cursor-not-allowed rounded-xl border border-slate-100 bg-slate-50 px-3 font-mono text-[10px] text-slate-500"
                />
              </label>
            </div>
          </section>

          {/* Guidance */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  What does this process do?
                </span>
                <textarea
                  value={localGuidance}
                  onChange={(e) => setLocalGuidance(e.target.value)}
                  onBlur={updateLocalEdits}
                  rows={4}
                  placeholder="Describe the document type and what the extraction model should prioritize..."
                  className="min-h-[76px] w-full rounded-xl border border-slate-200 p-3 text-[10px] leading-relaxed text-slate-700 outline-none focus:border-blue-400"
                />
              </label>
              <div className="flex flex-col justify-center">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Document type info
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-[10px]">
                    <span className="text-slate-500">Fields</span>
                    <span className="font-bold text-[#142b4b]">{selected.fields.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-[10px]">
                    <span className="text-slate-500">Required fields</span>
                    <span className="font-bold text-[#142b4b]">
                      {selected.fields.filter((f) => f.required).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-[10px]">
                    <span className="text-slate-500">Field types</span>
                    <span className="font-bold text-[#142b4b]">
                      {[...new Set(selected.fields.map((f) => f.type))].join(", ") || "---"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Output Schema */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.14em] text-blue-600">
                  Output schema
                </div>
                <h3 className="mt-1 font-display text-lg font-bold text-[#142b4b]">
                  Fields extracted from each document
                </h3>
              </div>
              <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[9px] font-bold text-blue-700">
                {selected.fields.length} fields
              </span>
            </div>

            {/* Fields table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[9px] uppercase tracking-wider text-slate-400">
                    <th className="pb-3 pr-3 font-bold">Field name</th>
                    <th className="pb-3 pr-3 font-bold">Type</th>
                    <th className="pb-3 pr-3 font-bold">Default / format</th>
                    <th className="pb-3 font-bold">Required</th>
                    <th className="pb-3 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.fields.map((field, index) => (
                    <tr
                      key={field.name + "-" + index}
                      className="border-b border-slate-100 text-[10px]"
                    >
                      <td className="py-2.5 pr-3">
                        <input
                          defaultValue={field.name}
                          onBlur={(e) => {
                            const name = e.target.value.trim();
                            if (!name || name === field.name) return;
                            void updateField(index, { name });
                          }}
                          className="h-8 w-full rounded-lg border border-slate-200 px-2 font-mono text-[10px] font-semibold text-blue-600 outline-none focus:border-blue-400"
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <select
                          value={field.type}
                          onChange={(e) =>
                            void updateField(index, { type: e.target.value as FieldType })
                          }
                          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] text-slate-600"
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          defaultValue={field.class ?? ""}
                          placeholder="e.g. YYYY-MM-DD"
                          onBlur={(e) => {
                            const cls = e.target.value.trim();
                            void updateField(index, { class: cls || undefined });
                          }}
                          className="h-8 w-full rounded-lg border border-slate-200 px-2 text-[10px] text-slate-600 outline-none focus:border-blue-400"
                        />
                      </td>
                      <td className="py-2.5">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) =>
                            void updateField(index, { required: e.target.checked })
                          }
                          className="accent-blue-600"
                        />
                      </td>
                      <td className="py-2.5">
                        <button
                          onClick={() => void removeField(index)}
                          className="rounded-lg px-2 py-1.5 text-[9px] font-bold text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add field */}
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={draftField}
                onChange={(e) => setDraftField(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addField()}
                placeholder="Add a field, e.g. MemberId"
                className="h-9 min-w-[260px] flex-1 rounded-xl border border-dashed border-slate-300 px-3 text-[10px] outline-none focus:border-blue-400"
              />
              <button
                onClick={() => void addField()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-700"
              >
                <Plus size={14} /> Add field
              </button>
            </div>
          </section>
        </main>
      ) : (
        <main className="flex min-w-0 flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <FileText size={22} className="text-slate-400" />
            </div>
            <div className="text-[13px] font-bold text-slate-500">No document type selected</div>
            <div className="mt-1 text-[10px] text-slate-400">
              {types.length > 0 ? "Select a document type from the left." : "Create one to get started."}
            </div>
          </div>
        </main>
      )}

      {/* Create dialog */}
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
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-.04em] text-[#142b4b]">
              Create document type
            </DialogTitle>
            <DialogDescription className="text-[11px] leading-relaxed text-slate-500">
              Name the type and add extraction guidance. Guidance is fed to the LLM when it writes the
              prompts/[typeKey].txt file.
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold text-slate-500">Name</span>
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (nameError) setNameError("");
              }}
              placeholder="e.g. Prior Auth Packet"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[11px] text-slate-700 outline-none focus:border-blue-400"
            />
            {nameError ? (
              <p className="mt-2 text-[10px] font-semibold text-rose-600">{nameError}</p>
            ) : null}
          </label>
          <label className="mt-4 block">
            <span className="mb-2 block text-[10px] font-bold text-slate-500">
              Guidance for extraction prompt
            </span>
            <textarea
              value={newGuidance}
              onChange={(e) => setNewGuidance(e.target.value)}
              rows={5}
              placeholder="e.g. Prefer header member IDs. Dates as YYYY-MM-DD. Never invent BIN/PCN."
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] text-slate-700 outline-none focus:border-blue-400"
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
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#156bc9] px-4 py-2.5 text-[10px] font-bold text-white"
            >
              <Check size={14} /> Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
