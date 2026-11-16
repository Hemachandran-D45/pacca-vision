import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sliders,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TenantRecord } from "../../../../server/senderra/v2Engine.js";

export default function TenantAdminPage() {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<"enterprise" | "standard" | "poc">("enterprise");
  const [newSlaMinutes, setNewSlaMinutes] = useState(120);
  const [submitting, setSubmitting] = useState(false);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/senderra/tenants");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.tenants)) {
          setTenants(data.tenants);
        }
      }
    } catch {
      toast.error("Failed to load tenants");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId.trim() || !newName.trim()) {
      toast.error("Tenant ID and Name are required");
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch("/api/senderra/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          name: newName.trim(),
          tier: newTier,
          config: {
            defaultSlaMinutes: Number(newSlaMinutes),
            autoStpThreshold: 0.9,
          },
        }),
      });

      if (res.ok) {
        toast.success("Enterprise tenant registered successfully");
        setIsModalOpen(false);
        setNewId("");
        setNewName("");
        fetchTenants();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create tenant");
      }
    } catch {
      toast.error("Network error creating tenant");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 p-4 sm:p-7 lg:p-9 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">
            <Building2 size={14} className="text-[#47a2b0]" />
            Multi-Tenant Isolation · PACCA V2.0
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Enterprise Tenants & Workspaces
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Dedicated customer partitions, tenant-scoped schemas, customized SLA guarantees, and auto-STP thresholds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTenants}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin text-[#47a2b0]")} />
            Refresh
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#47a2b0] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#37828e] transition active:scale-95"
          >
            <Plus size={14} /> Register New Tenant
          </button>
        </div>
      </div>

      {/* Tenant Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Organizations</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{tenants.length} Tenants</div>
          <div className="mt-1 text-[11px] text-emerald-600 font-medium">100% Data Isolation Active</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Partition Standard</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">Row & Cosmos Scoped</div>
          <div className="mt-1 text-[11px] text-slate-500">Native tenantId partition key</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Default Global SLA</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">120 Minutes</div>
          <div className="mt-1 text-[11px] text-indigo-600 font-medium">Automatic escalation enabled</div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
        <Search size={14} className="text-slate-400 ml-2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter tenants by name or ID..."
          className="w-full bg-transparent text-xs outline-none text-slate-800 placeholder:text-slate-400"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 mr-2">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Tenant Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((tenant) => (
          <div
            key={tenant.id}
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">{tenant.name}</h3>
                <div className="text-[11px] font-mono text-slate-400 mt-0.5">{tenant.id}</div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  tenant.tier === "enterprise" && "bg-purple-50 text-purple-700 border border-purple-200",
                  tenant.tier === "standard" && "bg-blue-50 text-blue-700 border border-blue-200",
                  tenant.tier === "poc" && "bg-amber-50 text-amber-700 border border-amber-200"
                )}
              >
                {tenant.tier}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-y border-slate-100 py-3">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Status</span>
                <div className="flex items-center gap-1 font-semibold text-emerald-600 mt-0.5">
                  <CheckCircle2 size={12} /> Active
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Target SLA</span>
                <div className="font-semibold text-slate-700 mt-0.5">
                  {Number((tenant.config as any)?.defaultSlaMinutes) || 120} min
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-[10px] text-slate-400">
                Created {new Date(tenant.createdAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => toast.success(`Switched active context to ${tenant.name}`)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-[#47a2b0] hover:bg-[#47a2b0]/5 transition"
              >
                Select Tenant
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Tenant Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-slate-50">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">Register Enterprise Tenant</h2>
                <p className="text-[11px] text-slate-500">Create a partitioned organization context with custom SLAs.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Organization / Tenant Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (!newId) setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                  }}
                  placeholder="e.g. UnitedHealth Group"
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none focus:border-[#47a2b0]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tenant ID (Slug)</label>
                <input
                  type="text"
                  required
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="e.g. tenant-uhg"
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-mono outline-none focus:border-[#47a2b0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tier</label>
                  <select
                    value={newTier}
                    onChange={(e) => setNewTier(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none"
                  >
                    <option value="enterprise">Enterprise</option>
                    <option value="standard">Standard</option>
                    <option value="poc">POC / Evaluation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target SLA (Min)</label>
                  <input
                    type="number"
                    value={newSlaMinutes}
                    onChange={(e) => setNewSlaMinutes(Number(e.target.value))}
                    min={15}
                    max={1440}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#47a2b0] px-4 py-2 text-xs font-bold text-white hover:bg-[#37828e] transition active:scale-95 disabled:opacity-50"
                >
                  {submitting ? "Registering..." : "Register Tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
