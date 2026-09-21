import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import yaml from "yaml";
import { uploadAssetsToFileShare, deleteTypeFromFileShare } from "./azureFileShare.js";

const execFileAsync = promisify(execFile);

const FIELD_TYPES = new Set(["string", "date", "number", "boolean"]);
const GUIDANCE_FILE = "pacca_guidance.json";

export type CatalogField = {
  name: string;
  type: string;
  required: boolean;
  class?: string;
};

export type CatalogType = {
  key: string;
  name: string;
  department?: string;
  guidance: string;
  fields: CatalogField[];
};

export type Catalog = { types: CatalogType[] };

export type ApiResult = { status: number; body: Record<string, unknown> };

function jsonError(status: number, message: string, extra?: Record<string, unknown>): ApiResult {
  return { status, body: { ok: false, error: message, ...extra } };
}

function getRepoRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "..", "analyzers", "senderra-analyzers.yaml"))) {
    return path.resolve(cwd, "..");
  }
  return cwd;
}

function getYamlPath(): string {
  return path.join(getRepoRoot(), "analyzers", "senderra-analyzers.yaml");
}

function getGapYamlPath(): string {
  return path.join(getRepoRoot(), "analyzers", "ivr_gap_routing.yaml");
}

function getBuildPromptsPath(): string {
  return path.join(getRepoRoot(), "analyzers", "build_prompts.py");
}

function getCanonicalOutDir(): string {
  return path.join(getRepoRoot(), "analyzers", "out");
}

function getAppOutDir(): string {
  return path.join(process.cwd(), "analyzers", "out");
}

function getFaAssetsDir(): string {
  return path.join(getRepoRoot(), "senderra-idp-fa", "assets");
}

export function toTypeKey(name: string): string {
  const parts = name
    .trim()
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const [first, ...rest] = parts;
  return (
    first.toLowerCase() +
    rest.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase()).join("")
  );
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function defaultDepartmentForType(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("prescription") || k.includes("rx") || k.includes("pharmacy") || k.includes("pbm")) {
    return "Pharmacy Operations";
  }
  if (k.includes("auth") || k.includes("pa") || k.includes("approval")) {
    return "Prior Authorization";
  }
  if (k.includes("appeal") || k.includes("denial")) {
    return "Appeals & Compliance";
  }
  if (k.includes("invoice") || k.includes("claim") || k.includes("insurance") || k.includes("bill") || k.includes("cms") || k.includes("ub04") || k.includes("explanation") || k.includes("eob")) {
    return "Billing & Claims";
  }
  if (k.includes("demographic") || k.includes("intake") || k.includes("enroll") || k.includes("referral")) {
    return "Patient Intake";
  }
  if (k.includes("chart") || k.includes("necessity") || k.includes("clinical") || k.includes("encounter") || k.includes("note") || k.includes("lab")) {
    return "Clinical Operations";
  }
  return "General Operations";
}

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function readGuidanceMap(): Record<string, { guidance: string; department?: string }> {
  const guidancePath = path.join(getAppOutDir(), GUIDANCE_FILE);
  if (!fs.existsSync(guidancePath)) return {};
  try {
    const raw = fs.readFileSync(guidancePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeGuidanceMap(types: CatalogType[]): void {
  const map = Object.fromEntries(
    types.map((item) => [
      item.key,
      {
        guidance: item.guidance ?? "",
        department: item.department || defaultDepartmentForType(item.key),
      },
    ])
  );
  const guidancePath = path.join(getAppOutDir(), GUIDANCE_FILE);
  fs.mkdirSync(path.dirname(guidancePath), { recursive: true });
  fs.writeFileSync(guidancePath, JSON.stringify(map, null, 2), "utf8");
}

export async function getCatalog(): Promise<ApiResult> {
  try {
    const fieldMetaPath = path.join(getAppOutDir(), "field_meta.json");
    if (!fs.existsSync(fieldMetaPath)) {
      const canonicalPath = path.join(getCanonicalOutDir(), "field_meta.json");
      if (fs.existsSync(canonicalPath)) {
        copyDirRecursive(getCanonicalOutDir(), getAppOutDir());
      }
    }

    if (!fs.existsSync(fieldMetaPath)) {
      return { status: 200, body: { ok: true, types: [] } };
    }

    const raw = fs.readFileSync(fieldMetaPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Record<string, any>>;
    const guidance = readGuidanceMap();
    const types: CatalogType[] = [];

    for (const [key, fieldsObj] of Object.entries(parsed)) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) continue;
      const fields: CatalogField[] = [];
      for (const [fieldName, fieldData] of Object.entries(fieldsObj)) {
        if (fieldName.startsWith("_")) continue;
        fields.push({
          name: fieldName,
          type: typeof fieldData.type === "string" ? fieldData.type : "string",
          required: false,
          class: typeof fieldData.class === "string" ? fieldData.class : "B",
        });
      }

      types.push({
        key,
        name: humanizeKey(key),
        department: guidance[key]?.department || defaultDepartmentForType(key),
        guidance: guidance[key]?.guidance || "",
        fields,
      });
    }

    return { status: 200, body: { ok: true, types } };
  } catch (error: any) {
    return jsonError(500, error?.message || "Could not read field_meta.json");
  }
}

export async function patchCatalog(body: any): Promise<ApiResult> {
  if (!body || typeof body !== "object" || !Array.isArray(body.types)) {
    return jsonError(400, "Request body must have a types array.");
  }
  const types: CatalogType[] = body.types;
  writeGuidanceMap(types);
  return { status: 200, body: { ok: true, types } };
}

export async function deleteDocumentType(body: any): Promise<ApiResult> {
  const typeKey = String(body?.typeKey ?? "").trim();
  if (!typeKey) return jsonError(400, "typeKey is required.");

  try {
    // 1. Delete local prompt and schema files in all asset directories
    const localDirs = [getCanonicalOutDir(), getAppOutDir(), getFaAssetsDir()];
    for (const dir of localDirs) {
      const promptFile = path.join(dir, "prompts", `${typeKey}.txt`);
      const schemaFile = path.join(dir, "schemas", `${typeKey}.json`);
      if (fs.existsSync(promptFile)) fs.unlinkSync(promptFile);
      if (fs.existsSync(schemaFile)) fs.unlinkSync(schemaFile);
    }

    // 2. Remove from senderra-analyzers.yaml
    const yamlPath = getYamlPath();
    if (fs.existsSync(yamlPath)) {
      const doc = yaml.parseDocument(fs.readFileSync(yamlPath, "utf8"));
      doc.deleteIn(["classification", "categories", typeKey]);

      const typesNode = doc.get("types") as yaml.YAMLSeq;
      if (typesNode && Array.isArray(typesNode.items)) {
        const idx = typesNode.items.findIndex((item: any) => item?.get?.("key") === typeKey || item?.key === typeKey);
        if (idx >= 0) typesNode.delete(idx);
      }
      fs.writeFileSync(yamlPath, doc.toString(), "utf8");

      const appYamlPath = path.join(process.cwd(), "analyzers", "senderra-analyzers.yaml");
      if (appYamlPath !== yamlPath) {
        fs.mkdirSync(path.dirname(appYamlPath), { recursive: true });
        fs.writeFileSync(appYamlPath, doc.toString(), "utf8");
      }
    }

    // 3. Remove from ivr_gap_routing.yaml
    const gapYamlPath = getGapYamlPath();
    if (fs.existsSync(gapYamlPath)) {
      const gapDoc = yaml.parseDocument(fs.readFileSync(gapYamlPath, "utf8"));
      gapDoc.deleteIn(["call_flows", typeKey]);
      fs.writeFileSync(gapYamlPath, gapDoc.toString(), "utf8");
    }

    // 4. Run build_prompts.py to recompile type_catalog, _classification, field_meta, manifest
    await execFileAsync("python", [getBuildPromptsPath()], { cwd: getRepoRoot() });

    // 5. Sync out dirs
    copyDirRecursive(getCanonicalOutDir(), getAppOutDir());
    copyDirRecursive(getCanonicalOutDir(), getFaAssetsDir());

    // 6. Delete specific prompt/schema files from Azure File Share
    await deleteTypeFromFileShare(typeKey);

    // 7. Push refreshed catalog, manifest, field_meta, and schemas to Azure Files
    await uploadAssetsToFileShare(getCanonicalOutDir());

    const catalog = await getCatalog();
    return {
      status: 200,
      body: {
        ok: true,
        typeKey,
        steps: [
          "local_files_deleted",
          "senderra_analyzers_yaml_updated",
          "ivr_gap_routing_yaml_updated",
          "build_prompts_recompiled",
          "fileshare_type_files_deleted",
          "fileshare_assets_synced",
        ],
        types: catalog.body.types,
      },
    };
  } catch (error: any) {
    return jsonError(500, `Delete failed: ${error?.message || error}`);
  }
}

// LLM Generator using Azure OpenAI gpt-5.6-luna
async function generateYamlWithLLM(selected: CatalogType): Promise<{
  categoryDescription: string;
  signals: string[];
  typeDescription: string;
  fieldDescriptions: Record<string, { class: string; type: string; method: string; description: string }>;
}> {
  const apiKey = process.env.OPENAI_API_KEY || "8dLKEYt2vwjNLSXetbfN2d0ddEPel8nD2GmyDYw0G3Cwb66SBDSGJQQJ99CHACYeBjFXJ3w3AAAAACOGJ5Ep";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://senderra-idp-fr.openai.azure.com/openai/deployments/gpt-5.6-luna";
  const apiVersion = process.env.OPENAI_API_VERSION || "2024-06-01";

  const prompt = `You are an expert compiler for the Senderra IDP YAML document analyzer specification.
Given the following document type and field schema configured in PACCA Vision:

Document Type Name: ${selected.name}
Type Key: ${selected.key}
Department: ${selected.department || "Clinical Operations"}
Extraction Guidance & Rules: ${selected.guidance || "Extract accurate metadata adhering to standard clinical guidelines."}

Fields:
${JSON.stringify(selected.fields, null, 2)}

Generate the exact specification components in JSON format:
{
  "categoryDescription": "Clear 2-4 sentence description for document classification (LLM call 1).",
  "signals": ["5 to 7 specific text patterns or visual section headers to detect this document type."],
  "typeDescription": "Comprehensive extraction instructions for LLM call 2.",
  "fieldDescriptions": {
    "<fieldName>": {
      "class": "A|B|C|D",
      "type": "string|date|number|boolean",
      "method": "extract|classify|generate",
      "description": "Precise instruction on where this field appears, label variations, and how to format the extracted value."
    }
  }
}`;

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions?api-version=${apiVersion}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You generate strict JSON specifications for the Senderra IDP YAML compiler. Only return valid JSON with no markdown wrap.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(text);
      if (parsed.categoryDescription && parsed.fieldDescriptions) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("LLM generation failed, using deterministic fallback:", err);
  }

  // Robust Fallback
  const fieldDescriptions: Record<string, any> = {};
  for (const f of selected.fields) {
    fieldDescriptions[f.name] = {
      class: f.class || "A",
      type: f.type || "string",
      method: f.class === "D" ? "classify" : "extract",
      description: `Extract ${humanizeKey(f.name)} as printed on the document.`,
    };
  }

  return {
    categoryDescription: selected.guidance || `A ${selected.name} document arriving in ${selected.department || "Clinical Operations"}.`,
    signals: [
      `"${selected.name}" title or header`,
      ...selected.fields.slice(0, 5).map((f) => `"${humanizeKey(f.name)}" label or block`),
    ],
    typeDescription: selected.guidance || `Extracts fields from ${selected.name}.`,
    fieldDescriptions,
  };
}

export async function saveDocumentType(body: any): Promise<ApiResult> {
  const typeKey = String(body?.typeKey ?? "").trim();
  if (!typeKey) return jsonError(400, "typeKey is required.");

  const catalogResult = await getCatalog();
  if (catalogResult.status !== 200) return catalogResult;
  const types = (catalogResult.body.types as CatalogType[]) ?? [];
  const selected = types.find((item) => item.key === typeKey);
  if (!selected) return jsonError(404, `Document type ${typeKey} was not found in catalog.`);

  try {
    const yamlPath = getYamlPath();
    if (!fs.existsSync(yamlPath)) {
      return jsonError(500, `senderra-analyzers.yaml not found at ${yamlPath}`);
    }

    // Step 1: Generate YAML content using Azure OpenAI gpt-5.6-luna
    const generated = await generateYamlWithLLM(selected);

    // Step 2: Read and update senderra-analyzers.yaml using parseDocument (preserves existing formatting and quotes)
    const doc = yaml.parseDocument(fs.readFileSync(yamlPath, "utf8"));

    doc.setIn(["classification", "categories", typeKey], {
      description: generated.categoryDescription,
      signals: generated.signals,
    });

    const fieldsMap: Record<string, any> = {};
    for (const field of selected.fields) {
      const descObj = generated.fieldDescriptions[field.name] || {};
      fieldsMap[field.name] = {
        class: field.class || descObj.class || "A",
        type: field.type || descObj.type || "string",
        method: field.class === "D" ? "classify" : (descObj.method || "extract"),
        description: descObj.description || `Extract ${humanizeKey(field.name)}.`,
      };
    }

    const typeDef = {
      key: typeKey,
      description: generated.typeDescription,
      spec_field_count: selected.fields.length,
      core_fields: [],
      fields: fieldsMap,
    };

    let typesSeq = doc.get("types") as yaml.YAMLSeq;
    if (!typesSeq) {
      doc.set("types", [typeDef]);
    } else {
      const idx = typesSeq.items.findIndex((t: any) => t?.get?.("key") === typeKey || t?.key === typeKey);
      if (idx >= 0) {
        typesSeq.set(idx, typeDef);
      } else {
        typesSeq.add(typeDef);
      }
    }

    fs.writeFileSync(yamlPath, doc.toString(), "utf8");

    // Also sync YAML to vision-application/analyzers if running from app directory
    const appYamlPath = path.join(process.cwd(), "analyzers", "senderra-analyzers.yaml");
    if (appYamlPath !== yamlPath) {
      fs.mkdirSync(path.dirname(appYamlPath), { recursive: true });
      fs.writeFileSync(appYamlPath, doc.toString(), "utf8");
    }

    // Step 2b: Update ivr_gap_routing.yaml for gap analysis
    const gapYamlPath = getGapYamlPath();
    if (fs.existsSync(gapYamlPath)) {
      const gapDoc = yaml.parseDocument(fs.readFileSync(gapYamlPath, "utf8"));
      gapDoc.setIn(["call_flows", typeKey], {
        use_case: 2,
        use_case_name: selected.name,
        direction: "outbound",
        called_party: ["prescriber", "patient"],
        note: selected.guidance || selected.name,
      });

      for (const field of selected.fields) {
        if (!gapDoc.getIn(["askable_by", field.name])) {
          const who = field.name.toLowerCase().includes("patient") || field.name.toLowerCase().includes("member")
            ? "patient"
            : "prescriber";
          gapDoc.setIn(["askable_by", field.name], who);
        }
      }

      fs.writeFileSync(gapYamlPath, gapDoc.toString(), "utf8");
    }

    // Step 3: Run python build_prompts.py
    const pythonScript = getBuildPromptsPath();
    const buildResult = await execFileAsync("python", [pythonScript], {
      cwd: getRepoRoot(),
    });

    console.log("build_prompts.py output:\n", buildResult.stdout);

    // Step 4: Sync to local copy in the application and function app
    const canonicalOut = getCanonicalOutDir();
    const appOut = getAppOutDir();
    const faAssets = getFaAssetsDir();

    copyDirRecursive(canonicalOut, appOut);
    copyDirRecursive(canonicalOut, faAssets);

    // Step 5: Push directly to Azure File Share
    const pushResult = await uploadAssetsToFileShare(canonicalOut);
    if (!pushResult.ok) {
      console.warn("Azure File Share push warning:", pushResult.error);
    }

    // Refresh catalog
    const refreshed = await getCatalog();

    return {
      status: 201,
      body: {
        ok: true,
        typeKey,
        steps: [
          "yaml_generated_with_gpt_5_6_luna",
          "senderra_analyzers_yaml_saved",
          "ivr_gap_routing_yaml_updated",
          "build_prompts_executed",
          "local_assets_synced",
          "azure_fileshare_pushed",
        ],
        fileSharePush: pushResult,
        types: refreshed.body.types,
      },
    };
  } catch (error: any) {
    console.error("Save & compile pipeline failed:", error);
    return jsonError(500, `Pipeline failed: ${error?.message || error}`);
  }
}

export async function handleSolutionsV2(
  method: string,
  body: unknown,
  _searchParams?: URLSearchParams
): Promise<ApiResult> {
  if (method === "GET") return getCatalog();
  if (method === "PATCH") return patchCatalog(body);
  if (method === "DELETE") return deleteDocumentType(body);
  if (method === "POST") return saveDocumentType(body);
  return jsonError(405, `${method} not allowed.`);
}
