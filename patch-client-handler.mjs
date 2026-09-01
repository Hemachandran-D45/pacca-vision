import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/pages/Home.tsx';
let text=fs.readFileSync(path,'utf8');
text=text.replace('onClick={() => name === "Client 1" ? onClientWorkspace("Client 1") : toast(`${name} overview opened`)}', 'onClick={() => { if (name === "Client 1") onClientWorkspace("Client 1"); else toast(`${name} overview opened`); }}');
fs.writeFileSync(path,text);
console.log('client row handler repaired');
