import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/pages/Home.tsx';
let text=fs.readFileSync(path,'utf8');
text=text.replace(/\[\["Invoices", "42%", "2,020", "#2874d2"\], \["Invoices", "24%", "1,155", "#18adb3"\], \["Contracts", "15%", "721", "#efa92b"\], \["Lab Reports", "10%", "481", "#8755c8"\], \["Others", "9%", "435", "#cdd3da"\]\]/, '[["Invoices", "100%", "3", "#2874d2"]]');
fs.writeFileSync(path,text);
console.log('document-type legend narrowed to invoices');
