from pathlib import Path
p=Path('/home/ubuntu/pacca-vision/client/src/pages/Home.tsx')
s=p.read_text()
old='  const effectivePrompt = selected.prompt.replace("{{PROCESS_DESCRIPTION}}", selected.processDescription).replace("{{MODEL_GUIDANCE}}", selected.modelGuidance);\n  const promptWithSchema = `${effectivePrompt}\\n\\nOUTPUT SCHEMA:\\n${schemaJson}`;\n  const schemaJson = `{\\n${selected.fields.map((field) => `  "${field.name}": "${field.defaultValue}"`).join(",\\n")}\\n}`;\n  const promptWithSchema = `${effectivePrompt}\\n\\nOUTPUT SCHEMA:\\n${schemaJson}`;'
new='  const effectivePrompt = selected.prompt.replace("{{PROCESS_DESCRIPTION}}", selected.processDescription).replace("{{MODEL_GUIDANCE}}", selected.modelGuidance);\n  const schemaJson = `{\\n${selected.fields.map((field) => `  "${field.name}": "${field.defaultValue}"`).join(",\\n")}\\n}`;\n  const promptWithSchema = `${effectivePrompt}\\n\\nOUTPUT SCHEMA:\\n${schemaJson}`;'
if old not in s:
    raise SystemExit('prompt declaration block not found')
p.write_text(s.replace(old,new,1))
print('prompt declarations repaired')
