import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/pages/Home.tsx';
let text=fs.readFileSync(path,'utf8');
const old=/const events = \[[\s\S]*?\n  \];/;
const start=text.indexOf('function AuditPage');
const end=text.indexOf('const solutions:', start);
let section=text.slice(start,end);
section=section.replace(old, `const events = [
    ["14:02:18", "Document delivered", "invoice_001.pdf", "PACCA Admin", "Deliver", "Validated", "Delivered", "Processing complete", "cor_7f42a9"],
    ["14:02:14", "Validation passed", "invoice_001.pdf", "Rules Engine", "Validate", "Extracted", "Validated", "All invoice rules passed", "cor_7f42a9"],
    ["14:01:56", "HIL field flagged", "invoice_002.pdf", "System", "HIL Review", "Extracted", "Needs Review", "Total Amount confidence 62%", "cor_1ab33c"],
    ["14:01:24", "Document received", "invoice_003.pdf", "Client 1 intake", "Ingest", "—", "Processing", "Source upload", "cor_b98211"],
  ];`);
text=text.slice(0,start)+section+text.slice(end);
text=text.replace('The model could not confidently identify a value. Review the highlighted area and confirm or correct the suggested extraction.</p></div><label className="block">', 'The model could not confidently identify a value. Review the highlighted area and confirm or correct the suggested extraction.</p><div className="mt-3 flex flex-wrap gap-1.5">{["Invoice Number", "Invoice Date", "Vendor Name", "Purchase Order", "Subtotal", "Tax Amount", "Total Amount", "Currency", "Due Date"].map((field) => <span key={field} className={cn("rounded-md px-2 py-1 text-[8px] font-semibold", field === "Total Amount" ? "bg-amber-100 text-amber-800" : "bg-white/70 text-amber-800/70")}>{field}</span>)}</div></div><label className="block">');
fs.writeFileSync(path,text);
console.log('visible consistency and HIL schema context updated');
