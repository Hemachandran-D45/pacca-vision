import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/components/MockAuth.tsx';
let text=fs.readFileSync(path,'utf8');
text=text.replace('useState("suresh@pacca.vision")', 'useState("admin@pacca.demo")');
text=text.replace('<option>Client 1</option></select>', '{entryMode === "central" ? <option>PACCA Platform</option> : <option>Client 1</option>}</select>');
fs.writeFileSync(path,text);
console.log('login scope display polished');
