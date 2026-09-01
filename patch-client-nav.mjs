import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/pages/Home.tsx';
let text=fs.readFileSync(path,'utf8');
text=text.replace('if (client === "Client 1") setUser({ ...user, name: "PACCA Admin · Client 1", tenant: "Client 1", tenantCode: "CLIENT1", experience: "client" });', 'if (client === "Client 1") { setUser({ ...user, name: "PACCA Admin · Client 1", tenant: "Client 1", tenantCode: "CLIENT1", experience: "client" }); navigate("/"); }');
fs.writeFileSync(path,text);
console.log('client selection now navigates to workspace');
