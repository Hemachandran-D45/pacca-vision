import { useEffect, useMemo, useState } from "react";
import { Cpu, History, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/common/SectionHeading";
import {
  ApiError,
  fetchLlmSettings,
  fetchModels,
  relativeTime,
  updateLlmSettings,
  type LlmSettings,
  type ModelInfo,
  type ModelsResponse,
} from "./api";

/**
 * The global model switch (Platform Admin).
 *
 * Changes the model every NEW document runs on, across all users. Documents
 * already in flight finish on the model they started with, and every worker
 * picks the change up within `ttl_sec` (about a minute) — no redeploy.
 *
 * The Function App decides what is allowed (models.json + PHI guard) and test-
 * calls the deployment before accepting; this page only offers what it says is
 * selectable and shows its refusals verbatim.
 */

const SOURCE_LABEL: Record<string, string> = {
  settings: "Set here",
  env: "App default (AOAI_DEPLOYMENT)",
  upload: "Per upload",
  override: "Re-extract override",
};

function price(model: ModelInfo) {
  const row = model.pricing_per_1m[model.sku_tier.startsWith("data") ? "datazone" : "global"];
  if (!row) return "—";
  const [input, cached, output] = row;
  return `$${input} / $${cached} / $${output}`;
}

export function ModelSettings() {
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([fetchModels(), fetchLlmSettings()]);
      setModels(m);
      setSettings(s);
      setModel(s.effective.model_id);
      setEffort(s.stored?.reasoning_effort ?? "");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const byId = useMemo(() => new Map((models?.models ?? []).map((m) => [m.id, m])), [models]);
  const chosen = byId.get(model);
  const active = settings ? byId.get(settings.effective.model_id) : undefined;
  const unchanged =
    !!settings && model === settings.effective.model_id && (effort || null) === (settings.stored?.reasoning_effort ?? null);

  async function save() {
    if (!chosen) return;
    setSaving(true);
    try {
      const result = await updateLlmSettings({
        model,
        reasoning_effort: chosen.capabilities.reasoning_effort ? effort || null : null,
        reason,
        etag: settings?.etag,
      });
      toast.success(`Switched to ${chosen.label}. All workers pick it up within ${result.propagates_within_sec}s.`);
      setReason("");
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 412) {
        toast.error("Someone else changed the model since you opened this page. Reloaded — check and try again.");
        await load();
      } else {
        toast.error(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading && !models) {
    return <div className="h-64 animate-pulse rounded-2xl border border-slate-200/80 bg-white" />;
  }
  if (error && !models) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-[11px] text-rose-700">
        <div className="font-bold">Model settings are unavailable.</div>
        <div className="mt-1">{error}</div>
        <button onClick={() => void load()} className="mt-3 font-bold underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Active model */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <SectionHeading
          title="Active model"
          eyebrow="Every new document, from every user, runs on this model unless its upload picked another."
          action="Refresh"
          onAction={() => void load()}
        />
        {settings && (
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl bg-[#ebf5f7]/60 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#47a2b0]">
              <Cpu size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-[#0e0e0e]">{active?.label ?? settings.effective.model_id}</div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {settings.effective.model_deployment} · {SOURCE_LABEL[settings.effective.model_source] ?? settings.effective.model_source}
                {settings.effective.reasoning_effort ? ` · reasoning ${settings.effective.reasoning_effort}` : ""}
              </div>
            </div>
            {settings.stored?.updated_at && (
              <div className="text-right text-[10px] text-slate-500">
                Changed {relativeTime(settings.stored.updated_at)} by{" "}
                <span className="font-semibold text-slate-700">{settings.stored.updated_by}</span>
                {settings.stored.reason ? <div className="mt-0.5 italic">“{settings.stored.reason}”</div> : null}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Switch */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <SectionHeading
          title="Switch model"
          eyebrow={`Takes effect for new documents within ${settings?.ttl_sec ?? 60}s. No redeploy. Documents already processing finish on their current model.`}
        />
        <div className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold text-slate-500">Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] text-slate-700 outline-none focus:border-[#47a2b0]"
            >
              {(models?.models ?? []).map((m) => (
                <option key={m.id} value={m.id} disabled={!m.selectable}>
                  {m.label}
                  {m.selectable ? "" : " — not available"}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[10px] font-bold text-slate-500">Reasoning effort</span>
            <select
              value={effort}
              disabled={!chosen?.capabilities.reasoning_effort}
              onChange={(e) => setEffort(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] text-slate-700 outline-none focus:border-[#47a2b0] disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">App default</option>
              {(models?.reasoning_efforts ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-[10px] font-bold text-slate-500">Reason (kept in the change history)</span>
            <input
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. cost trial on luna for this week"
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-[11px] text-slate-700 outline-none focus:border-[#47a2b0]"
            />
          </label>
        </div>

        {chosen && !chosen.phi_approved && (
          <div className="mt-4 flex max-w-2xl items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-800">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            {chosen.label} is not approved for PHI. The server will refuse it as the global model.
          </div>
        )}

        <button
          onClick={() => void save()}
          disabled={saving || unchanged || !chosen?.selectable}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e] disabled:opacity-50"
        >
          {saving ? <RefreshCw size={13} className="animate-spin" /> : null}
          {saving ? "Checking the deployment…" : "Switch model"}
        </button>
      </section>

      {/* Allowlist */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <SectionHeading
          title="Available models"
          eyebrow="The allowlist ships with the pipeline (models.json). Adding a model is a reviewed deploy, not a setting."
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[11px]">
            <thead className="text-[9px] uppercase tracking-[.12em] text-slate-400">
              <tr>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">PHI</th>
                <th className="py-2 pr-3">$ / 1M tokens (in / cached / out)</th>
                <th className="py-2">Availability</th>
              </tr>
            </thead>
            <tbody>
              {(models?.models ?? []).map((m) => (
                <tr key={m.id} className="border-t border-slate-100 align-top">
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-slate-800">{m.label}</div>
                    <div className="text-[9px] text-slate-400">{m.deployment} · {m.sku_tier}</div>
                  </td>
                  <td className="py-2.5 pr-3 capitalize">{m.status}</td>
                  <td className="py-2.5 pr-3">{m.phi_approved ? "Approved" : "No"}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{price(m)}</td>
                  <td className="py-2.5">
                    <span className={cn("font-semibold", m.selectable ? "text-[#1f845d]" : "text-slate-400")}>
                      {m.selectable ? "Selectable" : "Not available"}
                    </span>
                    {!m.selectable && m.not_selectable_reason && (
                      <div className="mt-0.5 max-w-xs text-[9px] text-slate-400">{m.not_selectable_reason}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* History */}
      {settings?.history && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-2">
            <History size={15} className="text-[#47a2b0]" />
            <SectionHeading title="Change history" eyebrow="Most recent first. Written by the Function App on every switch." />
          </div>
          {settings.history.length === 0 ? (
            <p className="mt-4 text-[11px] text-slate-400">No changes yet — the app default is in use.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[11px]">
                <thead className="text-[9px] uppercase tracking-[.12em] text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Who</th>
                    <th className="py-2 pr-3">From → To</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.history.map((change) => (
                    <tr key={`${change.version}-${change.updated_at}`} className="border-t border-slate-100">
                      <td className="py-2.5 pr-3 whitespace-nowrap" title={change.updated_at}>
                        {relativeTime(change.updated_at)}
                      </td>
                      <td className="py-2.5 pr-3">{change.updated_by}</td>
                      <td className="py-2.5 pr-3">
                        {change.from.model ?? "app default"} → <span className="font-semibold">{change.to.model}</span>
                        {change.to.reasoning_effort ? ` (${change.to.reasoning_effort})` : ""}
                      </td>
                      <td className="py-2.5 text-slate-500">{change.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
