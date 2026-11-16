import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck,
  FileStack,
  FileText,
  Filter,
  Layers,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  TransactionDetail,
  TransactionSummary,
} from "../../../../shared/transactions.js";

export default function TransactionLedgerPage({
  onNavigate,
}: {
  onNavigate?: (path: string) => void;
}) {
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [selectedTx, setSelectedTx] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);

  // Form for new packet intake
  const [newTitle, setNewTitle] = useState("");
  const [newChannel, setNewChannel] = useState("portal");
  const [newPriority, setNewPriority] = useState("normal");
  const [newDocName1, setNewDocName1] = useState("");
  const [newDocName2, setNewDocName2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/senderra/transactions");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
        }
      }
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const openDrawer = async (txId: string) => {
    try {
      setDrawerLoading(true);
      const res = await fetch(`/api/senderra/transaction?id=${encodeURIComponent(txId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.transaction) {
          setSelectedTx(data.transaction);
        }
      }
    } catch {
      toast.error("Could not load transaction detail");
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleCreatePacket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Please enter a packet title");
      return;
    }
    try {
      setSubmitting(true);
      const docs = [
        { documentId: `doc-${Date.now()}-lead`, name: newDocName1.trim() || `${newTitle} (Lead Form).pdf`, docType: "Prior Authorization" },
      ];
      if (newDocName2.trim()) {
        docs.push({
          documentId: `doc-${Date.now()}-att`,
          name: newDocName2.trim(),
          docType: "Clinical Notes",
        });
      }

      const res = await fetch("/api/senderra/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          channel: newChannel,
          priority: newPriority,
          documents: docs,
          notes: "Ingested via Enterprise Operator Console",
        }),
      });

      if (res.ok) {
        toast.success("Transaction packet created successfully");
        setIsIngestModalOpen(false);
        setNewTitle("");
        setNewDocName1("");
        setNewDocName2("");
        fetchTransactions();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create transaction packet");
      }
    } catch {
      toast.error("Failed to submit intake packet");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = transactions.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (channelFilter !== "all" && t.channel !== channelFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.caseNumber.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 p-4 sm:p-7 lg:p-9 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.15em] text-[#47a2b0]">
            <FileStack size={14} className="text-[#47a2b0]" />
            Multi-Document Operations · PACCA V2.0
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Transaction Packet Ledger
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Multi-document intake packets, cross-document entity reconciliation, risk scoring, and SLA audit ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTransactions}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin text-[#47a2b0]")} />
            Refresh
          </button>
          <button
            onClick={() => setIsIngestModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#47a2b0] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#37828e] transition active:scale-95"
          >
            <Plus size={14} /> Ingest Document Packet
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
        <div className="flex flex-1 min-w-[280px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Case Number, Packet Title or ID..."
            className="w-full bg-transparent text-xs outline-none text-slate-800 placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="needs_review">Needs Review</option>
            <option value="extracting">Extracting</option>
            <option value="classifying">Classifying</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="all">All Channels</option>
            <option value="api">API</option>
            <option value="portal">Portal</option>
            <option value="email">Email</option>
            <option value="sftp">SFTP</option>
            <option value="fax">Fax</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <th className="py-3 px-4">Case #</th>
              <th className="py-3 px-4">Packet / Title</th>
              <th className="py-3 px-4">Channel</th>
              <th className="py-3 px-4">Docs / Pages</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Risk Score</th>
              <th className="py-3 px-4">SLA Deadline</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <FileStack size={28} className="mx-auto mb-2 opacity-30" />
                  No transaction packets match your criteria.
                </td>
              </tr>
            ) : (
              filtered.map((tx) => {
                const isOverdue = tx.isSlaBreached;
                return (
                  <tr
                    key={tx.id}
                    onClick={() => openDrawer(tx.id)}
                    className="cursor-pointer transition hover:bg-slate-50/80"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {tx.caseNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{tx.title}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{tx.id}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        {tx.channel}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-700">{tx.totalDocuments} docs</span>
                      <span className="text-slate-400 ml-1">({tx.totalPages} pgs)</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          tx.status === "approved" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                          tx.status === "needs_review" && "bg-amber-50 text-amber-700 border border-amber-200",
                          tx.status === "failed" && "bg-rose-50 text-rose-700 border border-rose-200",
                          (tx.status === "extracting" || tx.status === "classifying") && "bg-blue-50 text-blue-700 border border-blue-200",
                          tx.status === "ingested" && "bg-slate-100 text-slate-600"
                        )}
                      >
                        {tx.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              tx.riskScore > 60 ? "bg-rose-500" : tx.riskScore > 30 ? "bg-amber-500" : "bg-emerald-500"
                            )}
                            style={{ width: `${tx.riskScore}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] font-semibold text-slate-600">
                          {tx.riskScore}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className={cn("flex items-center gap-1 font-medium", isOverdue ? "text-rose-600" : "text-slate-600")}>
                        <Clock size={12} className={isOverdue ? "text-rose-500 animate-pulse" : "text-slate-400"} />
                        <span className="text-[11px]">
                          {new Date(tx.slaDueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrawer(tx.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <Eye size={12} /> Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-over Packet Detail Drawer */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 p-5 bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#47a2b0]">{selectedTx.caseNumber}</span>
                  <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                    {selectedTx.channel}
                  </span>
                </div>
                <h2 className="mt-1 font-display text-lg font-bold text-slate-900">{selectedTx.title}</h2>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Summary Pills */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Total Files</div>
                  <div className="mt-1 text-base font-bold text-slate-800">{selectedTx.documents.length} documents</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Extraction Confidence</div>
                  <div className="mt-1 text-base font-bold text-emerald-600">
                    {Math.round((selectedTx.confidence || 0.92) * 100)}%
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Turnaround SLA</div>
                  <div className="mt-1 text-base font-bold text-slate-800">
                    {new Date(selectedTx.slaDueAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* Packet Documents List */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Documents in Packet ({selectedTx.documents.length})
                </h3>
                <div className="space-y-2">
                  {selectedTx.documents.map((doc, idx) => (
                    <div
                      key={doc.documentId}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-[#47a2b0]">
                          <FileText size={16} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800 text-xs">{doc.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {doc.docType || "Classified Doc"} · {doc.pageCount || 1} pages · {doc.status}
                          </div>
                        </div>
                      </div>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {idx === 0 ? "Lead Document" : "Attachment"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cross-Document Validation Findings */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-500" />
                  Cross-Document Consistency Findings
                </h3>
                {selectedTx.crossDocFindings.length === 0 ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                    No cross-document validation conflicts detected. Packet is consistent.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedTx.crossDocFindings.map((f) => (
                      <div
                        key={f.id}
                        className={cn(
                          "rounded-xl border p-3 text-xs",
                          f.severity === "error"
                            ? "border-rose-200 bg-rose-50/50"
                            : "border-slate-200 bg-slate-50/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">{f.title}</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            {f.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">{f.details}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit Log */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Transaction Audit Trail
                </h3>
                <div className="relative pl-4 border-l border-slate-200 space-y-3">
                  {selectedTx.auditLog.map((log) => (
                    <div key={log.id} className="relative">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[#47a2b0] border-2 border-white" />
                      <div className="text-xs font-semibold text-slate-800">{log.action}</div>
                      <div className="text-[10px] text-slate-400">
                        {log.actor} · {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                      {log.details && (
                        <div className="text-[11px] text-slate-600 mt-0.5">{log.details}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-slate-200 p-4 bg-slate-50 flex items-center justify-between">
              {onNavigate && (
                <button
                  onClick={() => {
                    setSelectedTx(null);
                    onNavigate("/hil-review");
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  Open in HIL Review Workbench
                </button>
              )}
              <button
                onClick={() => setSelectedTx(null)}
                className="rounded-xl bg-[#47a2b0] px-4 py-2 text-xs font-bold text-white hover:bg-[#37828e] transition"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ingest Packet Modal */}
      {isIngestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-slate-50">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">Ingest Multi-Document Packet</h2>
                <p className="text-[11px] text-slate-500">Group related case documents into an enterprise intake packet.</p>
              </div>
              <button onClick={() => setIsIngestModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePacket} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Packet Title / Case Name</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Humana Cardiology Prior Auth Intake"
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none focus:border-[#47a2b0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Channel</label>
                  <select
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none"
                  >
                    <option value="portal">Web Portal</option>
                    <option value="api">Direct API</option>
                    <option value="email">Email</option>
                    <option value="sftp">SFTP</option>
                    <option value="fax">Fax</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority SLA</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none"
                  >
                    <option value="normal">Normal (2 Hours)</option>
                    <option value="high">High (1 Hour)</option>
                    <option value="urgent">Urgent (30 Min)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Primary Document (Lead Form)</label>
                <input
                  type="text"
                  value={newDocName1}
                  onChange={(e) => setNewDocName1(e.target.value)}
                  placeholder="Prior_Authorization_Form_720.pdf"
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none focus:border-[#47a2b0]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Attachment (Clinical Notes / Lab)</label>
                <input
                  type="text"
                  value={newDocName2}
                  onChange={(e) => setNewDocName2(e.target.value)}
                  placeholder="Clinical_Notes_and_Encounter.pdf (Optional)"
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs outline-none focus:border-[#47a2b0]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsIngestModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#47a2b0] px-4 py-2 text-xs font-bold text-white hover:bg-[#37828e] transition active:scale-95 disabled:opacity-50"
                >
                  {submitting ? "Ingesting..." : "Ingest Packet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
