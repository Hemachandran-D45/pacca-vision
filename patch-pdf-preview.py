from pathlib import Path
p=Path('/home/ubuntu/pacca-vision/client/src/pages/Home.tsx')
s=p.read_text()
s=s.replace('  pdfUrl: string;\n};', '  pdfUrl: string;\n  previewUrl: string;\n};')
s=s.replace('pdfUrl: "/manus-storage/DOC-001_a6d8f81d.pdf" }', 'pdfUrl: "/manus-storage/DOC-001_a6d8f81d.pdf", previewUrl: "/manus-storage/DOC-001_afb71df2.png" }')
s=s.replace('pdfUrl: "/manus-storage/DOC-002_8e6a47f9.pdf" }', 'pdfUrl: "/manus-storage/DOC-002_8e6a47f9.pdf", previewUrl: "/manus-storage/DOC-002_6e16dee7.png" }')
s=s.replace('pdfUrl: "/manus-storage/DOC-003_d015122e.pdf" }', 'pdfUrl: "/manus-storage/DOC-003_d015122e.pdf", previewUrl: "/manus-storage/DOC-003_df218e98.png" }')
old='<iframe title={`Source invoice ${doc.id}`} src={doc.pdfUrl} className="h-[470px] w-full rounded-lg bg-white" />'
new='<div className="flex h-[470px] items-start justify-center overflow-auto rounded-lg bg-slate-100 p-4"><img src={doc.previewUrl} alt={`Rendered source invoice ${doc.id}`} className="w-full max-w-[430px] rounded-md bg-white shadow-sm" /></div>'
if old not in s: raise SystemExit('iframe not found')
s=s.replace(old,new)
s=s.replace('Source PDF · extracted input', 'Source document · extracted input')
p.write_text(s)
print('replaced iframe with image preview')
