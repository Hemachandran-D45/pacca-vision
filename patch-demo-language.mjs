import fs from 'node:fs';
const path='/home/ubuntu/pacca-vision/client/src/pages/Home.tsx';
let text=fs.readFileSync(path,'utf8');
for (const [from,to] of [
 ['Live telemetry · updated 3s ago','Representative demo telemetry · static snapshot'],
 ['Total Cost (USD)','Estimated processing cost (USD)'],
 ['May 02–08, 2024','Demo reporting window'],
 ['May 02–08 · $482.60 total','Demo snapshot · $482.60 estimated'],
 ['AWS Document Understanding','Document understanding (representative)'],
 ['AWS Bedrock (LLM)','LLM extraction (representative)'],
 ['Compute (Lambda / Step Fun.)','Compute orchestration (representative)'],
 ['Source intake" : index === 1 ? "AWS Textract" : index === 2 ? "Claude 3.5"','Source intake" : index === 1 ? "Representative OCR" : index === 2 ? "Representative LLM"'],
 ['AWS Lambda · 12 active workers','Managed compute · representative'],
 ['Step Functions · 6 workflows','Workflow orchestration · representative'],
 ['Bedrock · Claude 3.5','LLM gateway · representative'],
 ['CloudWatch · 30 day retention','Observability · representative'],
 ['S3 + DynamoDB · 184 GB','Metadata store · representative'],
]) text=text.split(from).join(to);
fs.writeFileSync(path,text);
console.log('static demo language updated');
