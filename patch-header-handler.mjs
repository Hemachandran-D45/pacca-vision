import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/pages/Home.tsx';
let text=fs.readFileSync(path,'utf8');
text=text.replace('onClick={onClientWorkspace} className="rounded-xl border', 'onClick={() => onClientWorkspace()} className="rounded-xl border');
fs.writeFileSync(path,text);
console.log('header handler fixed');
