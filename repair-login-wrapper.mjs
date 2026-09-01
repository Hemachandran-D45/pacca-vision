import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/components/MockAuth.tsx';
let text=fs.readFileSync(path,'utf8');
text=text.replace('{entryMode === "client" && <div className="mt-6 border-t border-slate-100 pt-5">', '<div className="mt-6 border-t border-slate-100 pt-5">');
text=text.replace('</div>}</div></div><div className="mt-5 flex items-center justify-center', '</div></div><div className="mt-5 flex items-center justify-center');
fs.writeFileSync(path,text);
console.log('login wrapper repaired');
