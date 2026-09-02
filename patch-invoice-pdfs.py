from pathlib import Path
import re
p=Path('/home/ubuntu/pacca-vision/client/src/pages/Home.tsx')
s=p.read_text()
s=s.replace('  color: string;\n};', '  color: string;\n  pdfUrl: string;\n};')
s=s.replace('{ id: "DOC-001", file: "invoice_001.pdf", type: "Invoice", source: "Client 1 intake", status: "Processed", confidence: "96%", pages: 4, received: "Today, 14:02", color: "#1f9b72" },', '{ id: "DOC-001", file: "invoice_001.pdf", type: "Invoice", source: "Client 1 intake", status: "Processed", confidence: "96%", pages: 1, received: "Today, 14:02", color: "#1f9b72", pdfUrl: "/manus-storage/DOC-001_a6d8f81d.pdf" },')
s=s.replace('{ id: "DOC-002", file: "invoice_002.pdf", type: "Invoice", source: "Client 1 intake", status: "Needs Review", confidence: "68%", pages: 7, received: "Today, 13:58", color: "#ed9a25" },', '{ id: "DOC-002", file: "invoice_002.pdf", type: "Invoice", source: "Client 1 intake", status: "Needs Review", confidence: "68%", pages: 1, received: "Today, 13:58", color: "#ed9a25", pdfUrl: "/manus-storage/DOC-002_8e6a47f9.pdf" },')
s=s.replace('{ id: "DOC-003", file: "invoice_003.pdf", type: "Invoice", source: "Client 1 intake", status: "Processing", confidence: "84%", pages: 12, received: "Today, 13:54", color: "#4779de" },', '{ id: "DOC-003", file: "invoice_003.pdf", type: "Invoice", source: "Client 1 intake", status: "Processing", confidence: "84%", pages: 1, received: "Today, 13:54", color: "#4779de", pdfUrl: "/manus-storage/DOC-003_d015122e.pdf" },')
s=s.replace('"Vendor Name", "Metro Industrial Supplies"', '"Vendor Name", "Brightline Workplace Services"').replace('"₹27,500", "92%"', '"₹28,750", "92%"').replace('"₹4,950", "91%"', '"₹5,175", "91%"').replace('"₹32,450", "90%"', '"₹33,925", "90%"').replace('"PO-45823", "88%"', '"PO-45837", "88%"')
s=s.replace('"Vendor Name", "ABC Supplies"', '"Vendor Name", "Northstar Office Supply Co."').replace('"₹39,565", "96%"', '"₹36,500", "96%"').replace('"₹8,685", "94%"', '"₹6,570", "94%"').replace('"₹48,250", "93%"', '"₹43,070", "93%"').replace('"PO-45821", "91%"', '"PO-45810", "91%"')
old_start='<div className="mt-5 flex min-h-[410px] items-center justify-center rounded-xl bg-[#edf1f5] p-6">'
start=s.find(old_start, s.find('function DocumentDetail'))
end=s.find('</section><div className="space-y-5">', start)
if start<0 or end<0: raise SystemExit('document preview block not found')
preview='<div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-[#edf1f5] p-3"><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-[.08em] text-slate-400">Source PDF · extracted input</span><a href={doc.pdfUrl} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-blue-600 hover:text-blue-800">Open PDF ↗</a></div><iframe title={`Source invoice ${doc.id}`} src={doc.pdfUrl} className="h-[470px] w-full rounded-lg bg-white" /></div>'
s=s[:start]+preview+s[end:]
p.write_text(s)
print('invoice PDFs wired')
