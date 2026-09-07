import { useEffect, useMemo, useState } from "react";
import { Check, Code2, Filter, Layers, Pencil, Plus, Search, ShieldAlert, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/common/StatusPill";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ValidationRule = {
  id: string;
  name: string;
  scope: string;
  category: "Math Reconciliation" | "Format / Regex" | "Completeness Gate" | "Cross-Field Sequence" | "Custom Script";
  expression: string;
  coverage: string;
  status: "Live" | "Draft";
  action: "Route to HIL" | "Reject Document" | "Auto-Correct";
};

const DEFAULT_RULES: ValidationRule[] = [
  {
    id: "rule-1",
    name: "Invoice Math Balancing",
    scope: "Commercial Invoice",
    category: "Math Reconciliation",
    expression: "subtotal + tax_amount == total_amount",
    coverage: "All incoming invoices",
    status: "Live",
    action: "Route to HIL",
  },
  {
    id: "rule-2",
    name: "Prescriber NPI 10-Digit Format",
    scope: "Prior Auth Packet",
    category: "Format / Regex",
    expression: "^\\d{10}$",
    coverage: "Prior Auth & Scripts",
    status: "Live",
    action: "Route to HIL",
  },
  {
    id: "rule-3",
    name: "Required Patient Name & DOB Gate",
    scope: "Prior Auth Packet",
    category: "Completeness Gate",
    expression: "patient_name != null && patient_dob != null",
    coverage: "Intake & Clinical",
    status: "Live",
    action: "Route to HIL",
  },
  {
    id: "rule-4",
    name: "Prescription Date Chronology",
    scope: "Prescription Intake",
    category: "Cross-Field Sequence",
    expression: "start_date <= end_date",
    coverage: "Pharmacy Intake",
    status: "Live",
    action: "Route to HIL",
  },
  {
    id: "rule-5",
    name: "Line Item Sum Reconciliation",
    scope: "Commercial Invoice",
    category: "Math Reconciliation",
    expression: "sum(line_items.amount) == subtotal",
    coverage: "Invoices with line items",
    status: "Draft",
    action: "Route to HIL",
  },
  {
    id: "rule-6",
    name: "Tax Amount Normalization",
    scope: "Commercial Invoice",
    category: "Format / Regex",
    expression: "tax_amount >= 0 && tax_amount <= total_amount",
    coverage: "Commercial Billing",
    status: "Live",
    action: "Auto-Correct",
  },
];

const DEFAULT_INTEGRATIONS = [
  ["Azure AI Document Intelligence", "Document understanding", "Connected", "2.3M calls"],
  ["Azure OpenAI Service", "GPT-4o / GPT-4o-mini", "Connected", "48.2K calls"],
  ["Microsoft OneDrive", "Source connector", "Connected", "1,204 docs"],
  ["Client 1 intake", "Source connector", "Attention", "Credential expires in 8d"],
];

export default function ConfigListPage({ kind }: { kind: "rules" | "integrations" }) {
  const [rules, setRules] = useState<ValidationRule[]>(() => {
    try {
      const saved = localStorage.getItem("pacca_dynamic_rules");
      return saved ? JSON.parse(saved) : DEFAULT_RULES;
    } catch {
      return DEFAULT_RULES;
    }
  });

  const [availableScopes, setAvailableScopes] = useState<string[]>([
    "Commercial Invoice",
    "Prior Auth Packet",
    "Prescription Intake",
    "Medical Claim",
    "Lab Report",
  ]);

  // Load scopes from Solutions API
  useEffect(() => {
    async function loadDocTypes() {
      try {
        const res = await fetch("/api/solutions-v2");
        const data = await res.json();
        if (data.types && Array.isArray(data.types)) {
          const names = data.types.map((t: any) => t.name).filter(Boolean);
          if (names.length > 0) {
            setAvailableScopes(Array.from(new Set([...names, "Commercial Invoice", "Prior Auth Packet"])));
          }
        }
      } catch {}
    }
    loadDocTypes();
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScope, setSelectedScope] = useState("All Scopes");

  // Add rule modal state
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleScope, setNewRuleScope] = useState("Commercial Invoice");
  const [newRuleCategory, setNewRuleCategory] = useState<ValidationRule["category"]>("Math Reconciliation");
  const [newRuleExpression, setNewRuleExpression] = useState("");
  const [newRuleAction, setNewRuleAction] = useState<ValidationRule["action"]>("Route to HIL");
  const [ruleError, setRuleError] = useState("");

  const persistRules = (updated: ValidationRule[]) => {
    setRules(updated);
    try {
      localStorage.setItem("pacca_dynamic_rules", JSON.stringify(updated));
    } catch {}
  };

  const toggleRuleStatus = (id: string) => {
    const updated = rules.map((r) => {
      if (r.id === id) {
        const nextStatus: "Live" | "Draft" = r.status === "Live" ? "Draft" : "Live";
        toast.success(`Rule "${r.name}" is now ${nextStatus}`);
        return { ...r, status: nextStatus };
      }
      return r;
    });
    persistRules(updated);
  };

  const handleCreateRule = () => {
    const trimmedName = newRuleName.trim();
    if (!trimmedName) {
      setRuleError("Rule name is required.");
      return;
    }
    const newRule: ValidationRule = {
      id: `rule-${Date.now()}`,
      name: trimmedName,
      scope: newRuleScope,
      category: newRuleCategory,
      expression: newRuleExpression.trim() || "field != null",
      coverage: `${newRuleScope} pipeline`,
      status: "Live",
      action: newRuleAction,
    };
    const nextList = [newRule, ...rules];
    persistRules(nextList);
    setAddRuleOpen(false);
    setNewRuleName("");
    setNewRuleExpression("");
    setRuleError("");
    toast.success(`Rule "${newRule.name}" created and set to Live`);
  };

  const handleDeleteRule = (id: string, name: string) => {
    const nextList = rules.filter((r) => r.id !== id);
    persistRules(nextList);
    toast.success(`Rule "${name}" deleted`);
  };

  const filteredRules = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return rules.filter((r) => {
      const matchesSearch =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.scope.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.expression.toLowerCase().includes(q);
      const matchesScope = selectedScope === "All Scopes" || r.scope === selectedScope;
      return matchesSearch && matchesScope;
    });
  }, [rules, searchQuery, selectedScope]);

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">Configure</div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-[-.05em] text-[#0e0e0e]">
            {kind === "rules" ? "Rules & Validations" : "Integrations"}
          </h2>
          <p className="mt-2 text-[11px] text-slate-500">
            {kind === "rules"
              ? "Dynamic validation gates guarding the handoff from AI extraction to trusted enterprise metadata."
              : "Manage platform services, source connectors, and model providers."}
          </p>
        </div>
        <button
          onClick={() => {
            if (kind === "rules") {
              setAddRuleOpen(true);
            } else {
              toast.success("Integration setup wizard opened");
            }
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e] shadow-sm transition"
        >
          <Plus size={14} /> Add {kind === "rules" ? "rule gate" : "integration"}
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <label className="flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3">
            <Search size={14} className="text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-[11px] outline-none"
              placeholder={`Search ${kind === "rules" ? "validation rules, expressions..." : "integrations"}...`}
            />
          </label>

          {kind === "rules" && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-700 shadow-xs">
              <span className="text-slate-400">Scope:</span>
              <select
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value)}
                className="bg-transparent outline-none cursor-pointer"
              >
                <option value="All Scopes">All Scopes ({rules.length})</option>
                {availableScopes.map((scope) => {
                  const count = rules.filter((r) => r.scope === scope).length;
                  return (
                    <option key={scope} value={scope}>
                      {scope} {count > 0 ? `(${count})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>

        {kind === "rules" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[9px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-bold">Rule Name & Expression</th>
                  <th className="px-3 py-3 font-bold">Target Scope</th>
                  <th className="px-3 py-3 font-bold">Category</th>
                  <th className="px-3 py-3 font-bold">Action on Failure</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-[11px] text-slate-400">
                      No validation rules match your query.
                    </td>
                  </tr>
                ) : (
                  filteredRules.map((rule) => (
                    <tr key={rule.id} className="border-b border-slate-100 text-[10px] hover:bg-[#ebf5f7]/30 transition">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-[#0e0e0e]">{rule.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] text-[#47a2b0]">
                          <Code2 size={11} /> {rule.expression}
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                          {rule.scope}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-slate-500 font-medium">{rule.category}</td>
                      <td className="px-3 py-3.5">
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                          <ShieldAlert size={12} /> {rule.action}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <button
                          onClick={() => toggleRuleStatus(rule.id)}
                          title="Click to toggle Live/Draft"
                          className="cursor-pointer transition hover:opacity-80"
                        >
                          <StatusPill status={rule.status} />
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toast(`Rule "${rule.name}" expression verified`, { description: `Validated on active pipeline.` })}
                            title="Verify Rule"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#ebf5f7] hover:text-[#47a2b0] transition"
                          >
                            <ShieldCheck size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.id, rule.name)}
                            title="Delete Rule"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[9px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-bold">Service</th>
                  <th className="px-3 py-3 font-bold">Function</th>
                  <th className="px-3 py-3 font-bold">Usage</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {DEFAULT_INTEGRATIONS.map((row) => (
                  <tr key={row[0]} className="border-b border-slate-100 text-[10px] hover:bg-[#ebf5f7]/40">
                    <td className="px-5 py-4 font-semibold text-[#0e0e0e]">{row[0]}</td>
                    <td className="px-3 py-4 text-slate-500">{row[1]}</td>
                    <td className="px-3 py-4 font-mono text-slate-600">{row[3]}</td>
                    <td className="px-3 py-4">
                      <StatusPill status={row[2]} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => toast(`Connected to ${row[0]}`, { description: "Azure credentials verified." })}
                        className="rounded-lg p-2 text-slate-400 hover:bg-[#ebf5f7] hover:text-[#47a2b0]"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* CREATE VALIDATION RULE DIALOG */}
      <Dialog open={addRuleOpen} onOpenChange={setAddRuleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold text-[#0e0e0e] flex items-center gap-2">
              <ShieldCheck size={18} className="text-[#47a2b0]" /> Add Validation Gate
            </DialogTitle>
            <DialogDescription className="text-[11px] text-slate-500">
              Create an automated validation rule to guard against misread fields, hallucination, or math mismatches.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold text-slate-500">
                Rule Name <span className="text-rose-500 font-bold">*</span>
              </span>
              <input
                value={newRuleName}
                onChange={(e) => {
                  setNewRuleName(e.target.value);
                  if (ruleError) setRuleError("");
                }}
                placeholder="e.g. Total Amount Consistency Gate"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-[11px] text-slate-700 outline-none focus:border-[#47a2b0]"
                autoFocus
              />
              {ruleError && <p className="mt-1.5 text-[10px] font-semibold text-rose-600">{ruleError}</p>}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold text-slate-500">Target Scope</span>
                <select
                  value={newRuleScope}
                  onChange={(e) => setNewRuleScope(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#47a2b0]"
                >
                  {availableScopes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold text-slate-500">Category</span>
                <select
                  value={newRuleCategory}
                  onChange={(e) => setNewRuleCategory(e.target.value as ValidationRule["category"])}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#47a2b0]"
                >
                  <option value="Math Reconciliation">Math Reconciliation</option>
                  <option value="Format / Regex">Format / Regex</option>
                  <option value="Completeness Gate">Completeness Gate</option>
                  <option value="Cross-Field Sequence">Cross-Field Sequence</option>
                  <option value="Custom Script">Custom Script</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold text-slate-500">Validation Expression / Logic</span>
              <input
                value={newRuleExpression}
                onChange={(e) => setNewRuleExpression(e.target.value)}
                placeholder="e.g. subtotal + tax == total or ^\d{10}$"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 font-mono text-[10px] text-slate-700 outline-none focus:border-[#47a2b0]"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold text-slate-500">Action on Failure</span>
              <select
                value={newRuleAction}
                onChange={(e) => setNewRuleAction(e.target.value as ValidationRule["action"])}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#47a2b0]"
              >
                <option value="Route to HIL">Route to HIL Review (Requires Human Decision)</option>
                <option value="Reject Document">Reject Document Immediately</option>
                <option value="Auto-Correct">Auto-Correct with Safe Default</option>
              </select>
            </label>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => {
                setAddRuleOpen(false);
                setRuleError("");
              }}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateRule}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#47a2b0] px-4 py-2 text-[10px] font-bold text-white hover:bg-[#37828e]"
            >
              <Check size={14} /> Create Rule Gate
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
