import { useEffect, useState } from "react";
import { fetchModels, type ModelsResponse } from "./api";

/**
 * The per-upload "Process with" choice, shared by every upload surface.
 *
 * "" means the active model (the global setting). Only models the pipeline
 * would accept for these uploads are offered — selectable, and PHI-approved
 * while the Function App requires it — and the server checks again before it
 * signs the upload. If the list cannot be loaded the picker renders nothing
 * and uploads go to the active model, exactly as before.
 */
export function useUploadModels() {
  const [models, setModels] = useState<ModelsResponse | null>(null);
  useEffect(() => {
    let live = true;
    fetchModels()
      .then((m) => live && setModels(m))
      .catch(() => live && setModels(null));
    return () => {
      live = false;
    };
  }, []);

  const choices = (models?.models ?? []).filter(
    (m) => m.selectable && (m.phi_approved || !models?.require_phi_approved)
  );
  const activeId = models?.active.model ?? "";
  const activeLabel = models?.models.find((m) => m.id === activeId)?.label ?? activeId;
  const labelOf = (id: string) => (id ? choices.find((m) => m.id === id)?.label ?? id : activeLabel);
  return { models, choices, activeId, activeLabel, labelOf };
}

export function UploadModelSelect({
  value,
  onChange,
  disabled,
  picker,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  picker: ReturnType<typeof useUploadModels>;
}) {
  if (!picker.models || picker.choices.length === 0) return null;
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Process with
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#47a2b0] disabled:opacity-60"
      >
        <option value="">Active model ({picker.activeLabel})</option>
        {picker.choices
          .filter((m) => m.id !== picker.activeId)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
      </select>
      <span className="mt-1 block text-[10px] text-slate-400">
        Applies to the files in this upload only. The active model is set by a Platform Admin in Settings.
      </span>
    </label>
  );
}
