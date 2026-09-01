import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/pages/Home.tsx';
let text=fs.readFileSync(path,'utf8');
text=text.replace('<div className="text-[11px] font-bold text-amber-800">{item.issue}</div><span className="rounded bg-white px-2 py-1 text-[9px] font-bold text-amber-700">Confidence 62%</span>', '<div className="text-[11px] font-bold text-amber-800">{resolved ? "Total Amount validated" : item.issue}</div><span className={cn("rounded bg-white px-2 py-1 text-[9px] font-bold", resolved ? "text-emerald-700" : "text-amber-700")}>{resolved ? "Confidence 100%" : "Confidence 62%"}</span>');
text=text.replace('<div className="h-full w-[62%] rounded-full bg-amber-500" />', '<div className={cn("h-full rounded-full", resolved ? "w-full bg-emerald-500" : "w-[62%] bg-amber-500")} />');
text=text.replace('The model could not confidently identify a value. Review the highlighted area and confirm or correct the suggested extraction.', '{resolved ? "Human correction recorded. Field is ready for validated delivery." : "The model could not confidently identify a value. Review the highlighted area and confirm or correct the suggested extraction."}');
fs.writeFileSync(path,text);
console.log('HIL resolve state updated');
