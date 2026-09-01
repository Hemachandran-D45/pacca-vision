import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/pages/Home.tsx';
let text=fs.readFileSync(path,'utf8');
text=text.replace('eyebrow="Page 1 of 4 · source rendition"', 'eyebrow={`Page 1 of ${doc.pages} · source rendition`}');
text=text.replace('<span className="mb-2 block text-[10px] font-bold uppercase tracking-[.08em] text-slate-400">Signature status</span><select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none"><option>Present — page 4</option><option>Not present</option><option>Unreadable</option></select>', '<span className="mb-2 block text-[10px] font-bold uppercase tracking-[.08em] text-slate-400">Total Amount · flagged field</span><input defaultValue="₹48,250" className="h-10 w-full rounded-xl border border-amber-300 bg-amber-50/30 px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-500" />');
text=text.replace('defaultValue="Signature verified against the source page."', 'defaultValue="Confirm the total amount against the invoice source before approval."');
fs.writeFileSync(path,text);
console.log('HIL invoice controls and dynamic page count updated');
