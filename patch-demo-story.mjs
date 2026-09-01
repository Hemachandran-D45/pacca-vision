import fs from 'node:fs';
const home = '/home/ubuntu/pacca-vision/client/src/pages/Home.tsx';
const auth = '/home/ubuntu/pacca-vision/client/src/components/MockAuth.tsx';
let text = fs.readFileSync(home, 'utf8');
let authText = fs.readFileSync(auth, 'utf8');
for (const [from, to] of [
  ['IHCS Production', 'Client 1'],
  ['IHCS Health Record', 'Invoices'],
  ['IHCS Auto-intake', 'Client 1 intake'],
  ['MEDRAC Portal', 'Client 1 intake'],
  ['Advanced MD', 'Client 1'],
  ['BCBS', 'Client 1'],
  ['Contract intelligence', 'Invoice Processing'],
  ['Invoice intelligence', 'Invoice Processing'],
  ['Healthcare records', 'Invoice Processing'],
  ['Lab report intake', 'Invoice Processing'],
  ['Contract signature check', 'Invoice total check'],
  ['Required PHI field gate', 'Required invoice field gate'],
  ['Lab value normalization', 'Tax amount normalization'],
]) text = text.split(from).join(to);
for (const [from, to] of [
  ['IHCS Production', 'Client 1'],
  ['Northwind Pilot', 'Client 1'],
  ['IHCS Production', 'Client 1'],
]) authText = authText.split(from).join(to);
const oldDocs = `const documents: DocumentRow[] = [\n  { id: "IHCS-2024-0004821", file: "20221219_093607_0852352_FM.pdf", type: "Health Record", source: "MEDRAC Portal", status: "Processed", confidence: "95%", pages: 1, received: "May 08, 13:59", color: "#1f9b72" },\n  { id: "IHCS-2024-0004820", file: "receipt_scan_0417.jpg", type: "Invoice", source: "IHCS Auto-intake", status: "HIL Review", confidence: "62%", pages: 1, received: "May 08, 13:55", color: "#ed9a25" },\n  { id: "AMD-2024-0003912", file: "vendor_contract_nda.pdf", type: "Contract", source: "OneDrive", status: "Validation failed", confidence: "—", pages: 5, received: "May 08, 13:54", color: "#e65d56" },\n  { id: "IHCS-2024-0004819", file: "lab_report_8839.pdf", type: "Lab Report", source: "API Intake", status: "Processed", confidence: "97%", pages: 3, received: "May 08, 13:53", color: "#1f9b72" },\n  { id: "IHCS-2024-0004818", file: "clinical_note_2387.pdf", type: "Health Record", source: "MEDRAC Portal", status: "HIL Review", confidence: "71%", pages: 12, received: "May 08, 13:52", color: "#ed9a25" },\n  { id: "IHCS-2024-0004817", file: "prior_auth_form_192.pdf", type: "Authorization", source: "SFTP intake", status: "Processing", confidence: "88%", pages: 2, received: "May 08, 13:50", color: "#4779de" },\n];`;
const newDocs = `const documents: DocumentRow[] = [\n  { id: "DOC-001", file: "invoice_001.pdf", type: "Invoice", source: "Client 1 intake", status: "Processed", confidence: "96%", pages: 4, received: "Today, 14:02", color: "#1f9b72" },\n  { id: "DOC-002", file: "invoice_002.pdf", type: "Invoice", source: "Client 1 intake", status: "Needs Review", confidence: "68%", pages: 7, received: "Today, 13:58", color: "#ed9a25" },\n  { id: "DOC-003", file: "invoice_003.pdf", type: "Invoice", source: "Client 1 intake", status: "Processing", confidence: "84%", pages: 12, received: "Today, 13:54", color: "#4779de" },\n];`;
text = text.replace(/const documents: DocumentRow\[\] = \[[\s\S]*?\n\];/, newDocs);
const oldQueue = `const hilQueue = [\n  { file: "vendor_contract_nda.pdf", issue: "Signature field", age: "18 min ago", priority: "High", kind: "contract", color: "#e65d56" },\n  { file: "receipt_scan_0417.jpg", issue: "Missing: Invoice Number", age: "34 min ago", priority: "Medium", kind: "image", color: "#ed9a25" },\n  { file: "clinical_note_2387.pdf", issue: "Low confidence: Diagnosis", age: "48 min ago", priority: "Medium", kind: "health", color: "#ed9a25" },\n  { file: "lab_report_8839.pdf", issue: "Validation rule failed", age: "1 hr ago", priority: "Low", kind: "lab", color: "#4b78d5" },\n];`;
const newQueue = `const hilQueue = [\n  { file: "invoice_002.pdf", issue: "Low confidence: Total Amount", age: "18 min ago", priority: "High", kind: "invoice", color: "#ed9a25" },\n];`;
text = text.replace(oldQueue, newQueue);
text = text.replace('status: "Processed" | "HIL Review" | "Validation failed" | "Processing";', 'status: "Processed" | "Needs Review" | "HIL Review" | "Validation failed" | "Processing";');
text = text.replace('<option>HIL Review</option>', '<option>Needs Review</option>');
text = text.replace('Live index · 4,812 documents', 'Client 1 · Invoice Processing · 3 documents');
text = text.replace('Page 1 of 1 · source rendition', 'Page 1 of 4 · source rendition');
text = text.replace('Source document</span><span>Page 1 of 5', 'Source document</span><span>Page 1 of 7');
text = text.replace('["patient_reference", "P-44019"], ["document_date", "2024-05-08"], ["provider_name", "Northwind Medical"], ["authorization_code", "AUTH-88431"]', '["invoice_number", "INV-2026-001"], ["invoice_date", "2026-08-28"], ["vendor_name", "ABC Supplies"], ["total_amount", "₹48,250"], ["tax_amount", "₹8,685"]');
text = text.replace('function DocumentDetailPage({ id, onBack, onNavigate }: { id: string; onBack: () => void; onNavigate: (path: string) => void }) {\n  const doc = documents.find((d) => d.id === id) ?? documents[0];', 'function DocumentDetailPage({ id, onBack, onNavigate }: { id: string; onBack: () => void; onNavigate: (path: string) => void }) {\n  const doc = documents.find((d) => d.id === id) ?? documents[0];\n  const canEdit = doc.status === "Needs Review" || doc.status === "HIL Review";');
text = text.replace('<button onClick={() => onNavigate("/metadata-studio")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"><Pencil size={13} /> Edit schema</button>', '<div className="flex items-center gap-2">{canEdit ? <button onClick={() => toast("Edit mode enabled", { description: "Review the flagged invoice fields before saving." })} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700"><Pencil size={13} /> Edit document</button> : <span className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-500">Read-only final metadata</span>}<button onClick={() => onNavigate("/metadata-studio")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50"><Pencil size={13} /> Edit schema</button></div>');
fs.writeFileSync(home, text);
fs.writeFileSync(auth, authText);
console.log('demo story patch applied');
