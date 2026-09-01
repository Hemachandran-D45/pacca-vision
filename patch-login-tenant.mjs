import fs from 'node:fs';
const path = '/home/ubuntu/pacca-vision/client/src/components/MockAuth.tsx';
let text = fs.readFileSync(path, 'utf8');
text = text.replace('onChange={(e) => { setTenant(e.target.value); const next = e.target.value === "Client 1" ? demoUsers[3] : demoUsers[2]; setEmail(next.email); }}', 'onChange={(e) => setTenant(e.target.value)}');
text = text.replace('<option>Client 1</option><option>Client 1</option>', '<option>Client 1</option>');
fs.writeFileSync(path, text);
console.log('single Client 1 tenant selector fixed');
