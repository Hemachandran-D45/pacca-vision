import { useEffect, useState } from "react";
import { Check, FileCog, Loader2, Plus, Save, Trash2 } from "lucide-react";
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
type CatalogType = { key: string; name: string; guidance: string; fields: CatalogField[] };

type CatalogResponse = { ok?: boolean; error?: string; types?: CatalogType[]; warning?: string };
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
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGuidance, setNewGuidance] = useState("");
  const [nameError, setNameError] = useState("");
  const [draftField, setDraftField] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [step, setStep] = useState("");

  const applyTypes = (next: CatalogType[]) =>
    setTypes(next.map((item) => ({ ...item, guidance: item.guidance ?? "" })));

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/solutions-v2");
      const payload = await readJson<CatalogResponse>(response);
      if (!response.ok || payload.ok === false) {
        toast.error(payload.error || "Could not load field_meta.json.");
        return;
      }
      applyTypes(payload.types ?? []);
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  const persist = async (next: CatalogType[]) => {
    applyTypes(next);
    const response = await fetch("/api/solutions-v2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ types: next }),
    });
    const payload = await readJson<CatalogResponse>(response);
    if (!response.ok || payload.ok === false) {
      toast.error(payload.error || "Could not update field_meta.json.");
      await loadCatalog();
      return false;
    }
    applyTypes(payload.types ?? next);
    return true;
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
    const ok = await persist([...types, { key, name, guidance: newGuidance.trim(), fields: [] }]);
    if (!ok) return;
    setCreateOpen(false);
    setNewName("");
    setNewGuidance("");
    setNameError("");
    toast.success("Document type added", { description: "Add fields, then Save to generate analyzer files." });
  };

  const addField = async (typeKey: string) => {
    const name = (draftField[typeKey] ?? "").trim();
    if (!name) return;
    const selected = types.find((item) => item.key === typeKey);
    if (!selected) return;
    if (selected.fields.some((field) => field.name === name)) {
      toast.error("Field already exists");
      return;
    }
    const ok = await persist(
      types.map((item) =>
        item.key === typeKey
          ? {
              ...item,
              fields: [...item.fields, { name, type: "string" as const, required: false, class: "string" }],
            }
          : item
      )
    );
    if (ok) setDraftField((current) => ({ ...current, [typeKey]: "" }));
  };

  const updateField = async (typeKey: string, index: number, changes: Partial<CatalogField>) => {
    await persist(
      types.map((item) =>
        item.key === typeKey
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

  const removeField = async (typeKey: string, index: number) => {
    await persist(
      types.map((item) =>
        item.key === typeKey
          ? { ...item, fields: item.fields.filter((_, fieldIndex) => fieldIndex !== index) }
          : item
      )
    );
  };

  const updateGuidance = async (typeKey: string, guidance: string) => {
    await persist(types.map((item) => (item.key === typeKey ? { ...item, guidance } : item)));
  };

  const deleteType = async (typeKey: string) => {
    if (!window.confirm(`Delete document type ${typeKey}? This removes its schema and prompt files.`)) return;
    setSavingKey(typeKey);
    setStep("Deleting…");
    try {
      const response = await fetch("/api/solutions-v2", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeKey }),
      });
      const payload = await readJson<CatalogResponse>(response);
      if (!response.ok || payload.ok === false) {
        toast.error(payload.error || "Could not delete the document type.");
        return;
      }
      applyTypes(payload.types ?? []);
      if (payload.warning) toast.error(payload.warning);
      else toast.success("Document type deleted");
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSavingKey(null);
      setStep("");
    }
  };

  const saveType = async (typeKey: string) => {
    const selected = types.find((item) => item.key === typeKey);
    if (!selected) return;
    if (!selected.fields.length) {
      toast.error("Add at least one field before saving.");
      return;
    }
    setSavingKey(typeKey);
    setStep("Updating type_catalog…");
    try {
      const response = await fetch("/api/solutions-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeKey }),
      });
      const payload = await readJson<SaveResponse>(response);
      if (!response.ok || payload.ok === false) {
        toast.error(payload.error || "Could not save the document type.");
        return;
      }
      if (payload.types) applyTypes(payload.types);
      toast.success("Analyzer files generated", {
        description: payload.commitSha
          ? `Committed to ${payload.repository ?? "GitHub"} (${payload.commitSha.slice(0, 7)}).`
          : "Local analyzer files were updated.",
      });
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSavingKey(null);
      setStep("");
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.15em] text-blue-600">Configure</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#142b4b]">Solutions V2</h2>
          <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-500">
            Document types from the local copy of senderra-idp-sol analyzers/out. Save generates updates and commits them back to that repo.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#156bc9] px-4 py-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-[#0d5aae]"
        >
          <Plus size={15} /> Create document type
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-[11px] text-slate-500">Loading field_meta.json…</div>
      ) : types.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-[11px] text-slate-500">
          No document types yet. Create one to start the field list.
        </div>
      ) : (
        <div className="grid gap-5">
          {types.map((item) => (
            <section key={item.key} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <FileCog size={17} />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-[#142b4b]">{item.name}</h3>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-400">{item.key}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={savingKey !== null}
                    onClick={() => void deleteType(item.key)}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[10px] font-bold text-rose-700 disabled:opacity-70"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                  <button
                    disabled={savingKey !== null}
                    onClick={() => void saveType(item.key)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#156bc9] px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-70"
                  >
                    {savingKey === item.key ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {savingKey === item.key ? step || "Saving…" : "Save"}
                  </button>
                </div>
              </div>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Guidance for {item.key}.txt
                </span>
                <textarea
                  defaultValue={item.guidance}
                  onBlur={(event) => {
                    const guidance = event.target.value.trim();
                    if (guidance === (item.guidance ?? "")) return;
                    void updateGuidance(item.key, guidance);
                  }}
                  placeholder="What the extraction prompt should emphasize…"
                  className="min-h-[72px] w-full rounded-xl border border-slate-200 p-3 text-[10px] leading-relaxed text-slate-700 outline-none focus:border-blue-400"
                />
              </label>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[9px] uppercase tracking-wider text-slate-400">
                      <th className="pb-3 font-bold">Field name</th>
                      <th className="pb-3 font-bold">Type</th>
                      <th className="pb-3 font-bold">Required</th>
                      <th className="pb-3 font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.fields.map((field, index) => (
                      <tr key={`${field.name}-${index}`} className="border-b border-slate-100 text-[10px]">
                        <td className="py-2.5">
                          <input
                            defaultValue={field.name}
                            onBlur={(event) => {
                              const name = event.target.value.trim();
                              if (!name || name === field.name) return;
                              void updateField(item.key, index, { name });
                            }}
                            className="h-8 w-full rounded-lg border border-slate-200 px-2 font-mono text-[10px] font-semibold text-blue-600 outline-none focus:border-blue-400"
                          />
                        </td>
                        <td className="py-2.5">
                          <select
                            value={field.type}
                            onChange={(event) =>
                              void updateField(item.key, index, { type: event.target.value as FieldType })
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
                        <td className="py-2.5">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) =>
                              void updateField(item.key, index, { required: event.target.checked })
                            }
                            className="accent-blue-600"
                          />
                        </td>
                        <td className="py-2.5">
                          <button
                            onClick={() => void removeField(item.key, index)}
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
              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  value={draftField[item.key] ?? ""}
                  onChange={(event) => setDraftField((current) => ({ ...current, [item.key]: event.target.value }))}
                  onKeyDown={(event) => event.key === "Enter" && void addField(item.key)}
                  placeholder="Add field, e.g. memberId"
                  className="h-9 min-w-[220px] flex-1 rounded-xl border border-dashed border-slate-300 px-3 text-[10px] outline-none focus:border-blue-400"
                />
                <button
                  onClick={() => void addField(item.key)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-700"
                >
                  <Plus size={14} /> Add field
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

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
              Name the type and add extraction guidance. Guidance is fed to the LLM when it writes prompts/{`{typeKey}`}.txt.
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold text-slate-500">Name</span>
            <input
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
                if (nameError) setNameError("");
              }}
              placeholder="e.g. Prior Auth Packet"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[11px] text-slate-700 outline-none focus:border-blue-400"
            />
            {nameError ? <p className="mt-2 text-[10px] font-semibold text-rose-600">{nameError}</p> : null}
          </label>
          <label className="mt-4 block">
            <span className="mb-2 block text-[10px] font-bold text-slate-500">Guidance for extraction prompt</span>
            <textarea
              value={newGuidance}
              onChange={(event) => setNewGuidance(event.target.value)}
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
