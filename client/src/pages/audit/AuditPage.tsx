import { Download, ListFilter, Search } from "lucide-react";
import { toast } from "sonner";

export default function AuditPage() {
  const events = [
    ["14:02:18", "Document delivered", "invoice_001.pdf", "PACCA Admin", "Deliver", "Validated", "Delivered", "Processing complete", "cor_7f42a9"],
    ["14:02:14", "Validation passed", "invoice_001.pdf", "Rules Engine", "Validate", "Extracted", "Validated", "All invoice rules passed", "cor_7f42a9"],
    ["14:01:56", "HIL field flagged", "invoice_002.pdf", "System", "HIL Review", "Extracted", "Needs Review", "Total Amount confidence 62%", "cor_1ab33c"],
    ["14:01:24", "Document received", "invoice_003.pdf", "Client 1 intake", "Ingest", "—", "Processing", "Source upload", "cor_b98211"],
  ];

  return (
    <div className="space-y-5 p-4 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-slate-500">Chronological operational history across documents, users, and automation.</div>
          <div className="mt-1 text-[11px] font-semibold text-[#0e0e0e]">Showing the last 24 hours · immutable event log</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => toast("Audit export queued")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50">
            <Download size={14} /> Export log
          </button>
          <button onClick={() => toast("Audit filters", { description: "Filter by actor, event type, document, or correlation ID." })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50">
            <ListFilter size={14} /> Filters
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          <label className="flex h-9 min-w-[230px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3">
            <Search size={14} className="text-slate-400" />
            <input className="w-full bg-transparent text-[11px] outline-none" placeholder="Search event, document, user, correlation ID" />
          </label>
          <select className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600">
            <option>All event types</option>
            <option>Document events</option>
            <option>Configuration changes</option>
            <option>System events</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[9px] font-bold uppercase tracking-[.08em] text-slate-400">
                <th className="px-5 py-3 font-bold">Timestamp</th>
                <th className="px-3 py-3 font-bold">Event</th>
                <th className="px-3 py-3 font-bold">Document</th>
                <th className="px-3 py-3 font-bold">User / actor</th>
                <th className="px-3 py-3 font-bold">Action</th>
                <th className="px-3 py-3 font-bold">Previous</th>
                <th className="px-3 py-3 font-bold">New status</th>
                <th className="px-3 py-3 font-bold">Reason</th>
                <th className="px-5 py-3 font-bold">Correlation ID</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={`${event[0]}-${event[1]}`} className="border-b border-slate-100 text-[10px] hover:bg-slate-50">
                  <td className="px-5 py-4 font-mono text-slate-400">{event[0]}</td>
                  <td className="px-3 py-4 font-semibold text-[#0e0e0e]">{event[1]}</td>
                  <td className="max-w-[180px] truncate px-3 py-4 text-slate-500">{event[2]}</td>
                  <td className="px-3 py-4 text-slate-500">{event[3]}</td>
                  <td className="px-3 py-4">
                    <span className="rounded-md bg-[#47a2b0]/10 px-2 py-1 text-[9px] font-bold text-[#47a2b0]">{event[4]}</span>
                  </td>
                  <td className="px-3 py-4 text-slate-400">{event[5]}</td>
                  <td className="px-3 py-4 text-slate-600">{event[6]}</td>
                  <td className="max-w-[190px] truncate px-3 py-4 text-slate-500">{event[7]}</td>
                  <td className="px-5 py-4 font-mono text-[9px] text-[#47a2b0]">{event[8]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
