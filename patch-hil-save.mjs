import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/pages/Home.tsx';
let text=fs.readFileSync(path,'utf8');
text=text.replace('const [resolved, setResolved] = useState(false);\n  const item', 'const [resolved, setResolved] = useState(false);\n  const [saved, setSaved] = useState(false);\n  const [totalAmount, setTotalAmount] = useState("₹49,560");\n  const item');
text=text.replace('setSelected(i); setResolved(false);', 'setSelected(i); setResolved(false); setSaved(false); setTotalAmount("₹49,560");');
text=text.replace('defaultValue="₹49,560" className="h-10 w-full rounded-xl border border-amber-300', 'value={totalAmount} onChange={(e) => { setTotalAmount(e.target.value); setSaved(false); setResolved(false); }} className="h-10 w-full rounded-xl border border-amber-300');
text=text.replace('<div className="flex flex-wrap gap-2 pt-1"><button onClick={() => { setResolved(true);', '<div className="flex flex-wrap gap-2 pt-1"><button onClick={() => { setSaved(true); toast.success("Changes saved", { description: "Total Amount correction saved to the review draft." }); }} className={cn("inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[11px] font-bold", saved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}><Check size={14} /> {saved ? "Changes saved" : "Save changes"}</button><button onClick={() => { setResolved(true);');
fs.writeFileSync(path,text);
console.log('inline HIL save behavior added');
