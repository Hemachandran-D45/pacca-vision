import fs from "node:fs";
import path from "node:path";
import {
  completeChat,
  fillTemplate,
  loadSolutionsV2Prompt,
  type ChatMessage,
} from "./chatCompletions.js";
import { commitFilesToGitHub, type ApiResult } from "./solutionsApi.js";

const FIELD_TYPES = new Set(["string", "date", "number", "boolean"]);
const GUIDANCE_FILE = "pacca_guidance.json";
const ANALYZERS_PREFIX = "analyzers/out";

export type CatalogField = {
  name: string;
  type: string;
  required: boolean;
  class?: string;
};

export type CatalogType = {
  key: string;
  name: string;
  guidance: string;
  fields: CatalogField[];
};

export type Catalog = { types: CatalogType[] };

function jsonError(status: number, message: string, extra?: Record<string, unknown>): ApiResult {
  return { status, body: { ok: false, error: message, ...extra } };
}

function projectRoot(): string {
  return process.cwd();
}

function outDir(): string {
  return path.join(process.cwd(), "analyzers", "out");
}

function localPath(relative: string): string {
  const resolved = path.resolve(outDir(), relative);
  const root = path.resolve(outDir());
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escaped analyzers/out.");
  }
  return resolved;
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

function uiTypeFromClass(value: string): string {
  const lowered = value.toLowerCase();
  if (lowered === "date" || lowered === "datetime") return "date";
  if (lowered === "number" || lowered === "integer" || lowered === "money" || lowered === "amount") return "number";
  if (lowered === "boolean" || lowered === "bool") return "boolean";
  return "string";
}

function uiTypeFromSchema(schema: unknown): string {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return "string";
  const node = schema as { type?: unknown; format?: unknown };
  const rawType = Array.isArray(node.type) ? String(node.type.find((item) => item !== "null") ?? "string") : String(node.type ?? "string");
  if (rawType === "number" || rawType === "integer") return "number";
  if (rawType === "boolean") return "boolean";
  if (node.format === "date" || node.format === "date-time") return "date";
  return "string";
}

function isCatalogField(value: unknown): value is CatalogField {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const field = value as Record<string, unknown>;
  const type = typeof field.type === "string" ? uiTypeFromClass(field.type) : "string";
  return (
    typeof field.name === "string" &&
    field.name.trim().length > 0 &&
    FIELD_TYPES.has(type) &&
    (typeof field.required === "boolean" || field.required === undefined)
  );
}

function isCatalogType(value: unknown): value is CatalogType {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.key === "string" &&
    /^[A-Za-z][A-Za-z0-9]*$/.test(item.key) &&
    typeof item.name === "string" &&
    item.name.trim().length > 0 &&
    Array.isArray(item.fields) &&
    item.fields.every(isCatalogField)
  );
}

function normalizeType(item: CatalogType): CatalogType {
  return {
    key: item.key,
    name: item.name.trim(),
    guidance: typeof item.guidance === "string" ? item.guidance : "",
    fields: item.fields.map((field) => ({
      name: field.name.trim(),
      type: FIELD_TYPES.has(field.type) ? field.type : uiTypeFromClass(field.type),
      required: Boolean(field.required),
      class: typeof field.class === "string" && field.class ? field.class : field.type,
    })),
  };
}

function readLocal(relative: string): string | null {
  const filePath = localPath(relative);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function writeLocal(relative: string, content: string): void {
  try {
    const filePath = localPath(relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") return;
    throw error;
  }
}

function deleteLocal(relative: string): void {
  try {
    const filePath = localPath(relative);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

function readGuidanceMap(): Record<string, string> {
  const raw = readLocal(GUIDANCE_FILE);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
}

function writeGuidanceMap(types: CatalogType[]): void {
  const map = Object.fromEntries(types.map((item) => [item.key, item.guidance ?? ""]));
  writeLocal(GUIDANCE_FILE, JSON.stringify(map, null, 2));
}

function readSchema(typeKey: string): { properties: Record<string, unknown>; required: string[] } {
  const raw = readLocal(`schemas/${typeKey}.json`);
  if (!raw) return { properties: {}, required: [] };
  try {
    const parsed = JSON.parse(raw) as { properties?: Record<string, unknown>; required?: unknown };
    const properties = parsed.properties && typeof parsed.properties === "object" ? parsed.properties : {};
    const required = Array.isArray(parsed.required) ? parsed.required.filter((item) => typeof item === "string") : [];
    return { properties, required };
  } catch {
    return { properties: {}, required: [] };
  }
}

function fieldsFromClassMap(typeKey: string, value: unknown): CatalogField[] {
  const schema = readSchema(typeKey);
  const fields: CatalogField[] = [];
  const seen = new Set<string>();

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [name, spec] of Object.entries(value as Record<string, unknown>)) {
      if (name.startsWith("_")) continue;
      seen.add(name);
      const className =
        typeof spec === "string"
          ? spec
          : spec && typeof spec === "object" && !Array.isArray(spec) && typeof (spec as { class?: unknown }).class === "string"
            ? String((spec as { class: string }).class)
            : "string";
      const typeFromSpec =
        spec && typeof spec === "object" && !Array.isArray(spec) && typeof (spec as { type?: unknown }).type === "string"
          ? uiTypeFromClass(String((spec as { type: string }).type))
          : uiTypeFromClass(className);
      const requiredFromSpec =
        spec && typeof spec === "object" && !Array.isArray(spec) && typeof (spec as { required?: unknown }).required === "boolean"
          ? Boolean((spec as { required: boolean }).required)
          : schema.required.includes(name);
      fields.push({
        name,
        type: schema.properties[name] ? uiTypeFromSchema(schema.properties[name]) : typeFromSpec,
        required: requiredFromSpec,
        class: className,
      });
    }
  }

  for (const name of Object.keys(schema.properties)) {
    if (seen.has(name)) continue;
    fields.push({
      name,
      type: uiTypeFromSchema(schema.properties[name]),
      required: schema.required.includes(name),
      class: uiTypeFromSchema(schema.properties[name]),
    });
  }
  return fields;
}

function catalogFromFieldMeta(raw: string): Catalog | ApiResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return jsonError(500, "field_meta.json is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonError(500, "field_meta.json must be a JSON object.");
  }
  const guidance = readGuidanceMap();
  const root = parsed as Record<string, unknown>;

  if (Array.isArray(root.types) && root.types.every(isCatalogType)) {
    return {
      types: (root.types as CatalogType[]).map((item) =>
        normalizeType({ ...item, guidance: item.guidance || guidance[item.key] || "" })
      ),
    };
  }

  const types: CatalogType[] = [];
  for (const [key, value] of Object.entries(root)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) continue;
    types.push(
      normalizeType({
        key,
        name: humanizeKey(key),
        guidance: guidance[key] || "",
        fields: fieldsFromClassMap(key, value),
      })
    );
  }
  return { types };
}

function idpTypeFromUi(type: string, previous?: string): string {
  if (previous === "object" && type === "string") return "object";
  if (type === "date") return "date";
  if (type === "number") return "number";
  if (type === "boolean") return "boolean";
  return "string";
}

function serializeFieldMeta(catalog: Catalog): string {
  let existing: Record<string, Record<string, unknown>> = {};
  const raw = readLocal("field_meta.json");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !Array.isArray((parsed as { types?: unknown }).types)) {
        existing = parsed as Record<string, Record<string, unknown>>;
      }
    } catch {
      existing = {};
    }
  }
  const native: Record<string, Record<string, unknown>> = {};
  for (const item of catalog.types) {
    const prevType =
      existing[item.key] && typeof existing[item.key] === "object" && !Array.isArray(existing[item.key])
        ? (existing[item.key] as Record<string, unknown>)
        : {};
    native[item.key] = {};
    for (const field of item.fields) {
      const prev = prevType[field.name];
      const prevObj = prev && typeof prev === "object" && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {};
      const prevTypeName = typeof prevObj.type === "string" ? prevObj.type : undefined;
      native[item.key][field.name] = {
        doc_type: item.key,
        class:
          typeof prevObj.class === "string"
            ? prevObj.class
            : field.class && /^[A-D]$/.test(field.class)
              ? field.class
              : "B",
        type: idpTypeFromUi(field.type, prevTypeName),
        method: typeof prevObj.method === "string" ? prevObj.method : "extract",
        enum: Object.prototype.hasOwnProperty.call(prevObj, "enum") ? prevObj.enum : null,
        description: typeof prevObj.description === "string" ? prevObj.description : "",
      };
    }
  }
  return `${JSON.stringify(native, null, 2)}\n`;
}

function parseCatalogBody(types: unknown): Catalog | ApiResult {
  if (!Array.isArray(types)) return jsonError(400, "types must be an array.");
  const catalog: CatalogType[] = [];
  for (const item of types) {
    if (!isCatalogType(item)) return jsonError(400, "types must be an array of document types with valid fields.");
    catalog.push(normalizeType({ ...item, guidance: typeof item.guidance === "string" ? item.guidance : "" }));
  }
  return { types: catalog };
}

async function readFileWithFallback(relative: string): Promise<string> {
  return readLocal(relative) ?? "";
}

export async function getCatalog(): Promise<ApiResult> {
  try {
    const raw = await readFileWithFallback("field_meta.json");
    if (!raw.trim()) {
      writeLocal("field_meta.json", "{}\n");
      return { status: 200, body: { ok: true, types: [] } };
    }
    const catalog = catalogFromFieldMeta(raw);
    if ("status" in catalog) return catalog;
    return { status: 200, body: { ok: true, types: catalog.types } };
  } catch (error) {
    return jsonError(500, error instanceof Error ? error.message : "Could not read field_meta.json.");
  }
}

function persistCatalog(catalog: Catalog): ApiResult {
  writeLocal("field_meta.json", serializeFieldMeta(catalog));
  writeGuidanceMap(catalog.types);
  return { status: 200, body: { ok: true, types: catalog.types } };
}

export async function patchCatalog(body: unknown): Promise<ApiResult> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Request body must be a JSON object.");
  }
  const catalog = parseCatalogBody((body as { types?: unknown }).types);
  if ("status" in catalog) return catalog;
  try {
    return persistCatalog(catalog);
  } catch (error) {
    return jsonError(500, error instanceof Error ? error.message : "Could not write field_meta.json.");
  }
}

function stripClassificationEnum(typeKey: string): void {
  const raw = readLocal("schemas/_classification.json");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as {
      properties?: { doc_type?: { enum?: unknown } };
    };
    const list = parsed.properties?.doc_type?.enum;
    if (!Array.isArray(list)) return;
    parsed.properties!.doc_type!.enum = list.filter((item) => item !== typeKey);
    writeLocal("schemas/_classification.json", JSON.stringify(parsed, null, 2));
  } catch {
    /* leave file */
  }
}

export async function deleteDocumentType(body: unknown): Promise<ApiResult> {
  const typeKey = String((body as { typeKey?: unknown } | null)?.typeKey ?? "").trim();
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(typeKey)) {
    return jsonError(400, "typeKey must be a camelCase identifier.");
  }
  const catalogResult = await getCatalog();
  if (catalogResult.status !== 200) return catalogResult;
  const types = ((catalogResult.body.types as CatalogType[]) ?? []).filter((item) => item.key !== typeKey);
  persistCatalog({ types });
  deleteLocal(`schemas/${typeKey}.json`);
  deleteLocal(`prompts/${typeKey}.txt`);
  stripClassificationEnum(typeKey);

  const committed = await commitFilesToGitHub(
    [{ path: `${ANALYZERS_PREFIX}/field_meta.json`, content: serializeFieldMeta({ types }) }],
    `chore(analyzers): remove ${typeKey} from PACCA Solutions V2`,
    [`${ANALYZERS_PREFIX}/schemas/${typeKey}.json`, `${ANALYZERS_PREFIX}/prompts/${typeKey}.txt`]
  );
  if (committed.status >= 400) {
    return {
      status: 200,
      body: {
        ok: true,
        types,
        warning: String(committed.body.error ?? "Type removed locally. GitHub delete failed."),
        github: committed.body,
      },
    };
  }
  return { status: 200, body: { ok: true, types, ...committed.body } };
}

function loadStepPrompt(name: string): { template: string } | ApiResult {
  const loaded = loadSolutionsV2Prompt(name);
  if ("ok" in loaded) return jsonError(loaded.status, loaded.error);
  return loaded;
}

async function runStep(
  messages: ChatMessage[],
  userText: string
): Promise<{ text: string; model: string } | ApiResult> {
  messages.push({ role: "user", content: userText });
  const result = await completeChat(messages);
  if (!result.ok) return jsonError(result.status, result.error);
  messages.push({ role: "assistant", content: result.text });
  return { text: result.text, model: result.model };
}

export async function saveDocumentType(body: unknown): Promise<ApiResult> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Request body must be a JSON object.");
  }
  const typeKey = String((body as { typeKey?: unknown }).typeKey ?? "").trim();
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(typeKey)) {
    return jsonError(400, "typeKey must be a camelCase identifier.");
  }

  const catalogResult = await getCatalog();
  if (catalogResult.status !== 200) return catalogResult;
  const types = (catalogResult.body.types as CatalogType[]) ?? [];
  const selected = types.find((item) => item.key === typeKey);
  if (!selected) return jsonError(404, `Document type ${typeKey} was not found in field_meta.json.`);
  if (!selected.fields.length) return jsonError(400, "Add at least one field before saving.");

  const system = loadStepPrompt("system.txt");
  if ("status" in system) return system;
  const typeCatalogPrompt = loadStepPrompt("type-catalog.txt");
  if ("status" in typeCatalogPrompt) return typeCatalogPrompt;
  const classificationPrompt = loadStepPrompt("classification.txt");
  if ("status" in classificationPrompt) return classificationPrompt;
  const schemaPrompt = loadStepPrompt("schema.txt");
  if ("status" in schemaPrompt) return schemaPrompt;
  const promptPrompt = loadStepPrompt("prompt.txt");
  if ("status" in promptPrompt) return promptPrompt;
  const fieldMetaPrompt = loadStepPrompt("field-meta.txt");
  if ("status" in fieldMetaPrompt) return fieldMetaPrompt;
  const manifestPrompt = loadStepPrompt("manifest.txt");
  if ("status" in manifestPrompt) return manifestPrompt;

  const fieldsJson = JSON.stringify(selected.fields, null, 2);
  const vars = {
    typeKey,
    typeName: selected.name,
    fieldsJson,
    guidance: selected.guidance || "(none provided)",
  };
  const messages: ChatMessage[] = [{ role: "system", content: system.template }];
  const changed: Array<{ path: string; relative: string; content: string }> = [];
  let model = "";

  const typeCatalog = await readFileWithFallback("type_catalog.txt");
  const catalogOut = await runStep(
    messages,
    fillTemplate(typeCatalogPrompt.template, { ...vars, file: typeCatalog })
  );
  if ("status" in catalogOut) return catalogOut;
  model = catalogOut.model;
  writeLocal("type_catalog.txt", catalogOut.text);
  changed.push({ path: `${ANALYZERS_PREFIX}/type_catalog.txt`, relative: "type_catalog.txt", content: catalogOut.text });

  const classification = await readFileWithFallback("schemas/_classification.json");
  const classOut = await runStep(
    messages,
    fillTemplate(classificationPrompt.template, { ...vars, file: classification })
  );
  if ("status" in classOut) return classOut;
  writeLocal("schemas/_classification.json", classOut.text);
  changed.push({
    path: `${ANALYZERS_PREFIX}/schemas/_classification.json`,
    relative: "schemas/_classification.json",
    content: classOut.text,
  });

  const schemaFile = await readFileWithFallback(`schemas/${typeKey}.json`);
  const schemaOut = await runStep(
    messages,
    fillTemplate(schemaPrompt.template, { ...vars, file: schemaFile })
  );
  if ("status" in schemaOut) return schemaOut;
  writeLocal(`schemas/${typeKey}.json`, schemaOut.text);
  changed.push({
    path: `${ANALYZERS_PREFIX}/schemas/${typeKey}.json`,
    relative: `schemas/${typeKey}.json`,
    content: schemaOut.text,
  });

  const promptFile = await readFileWithFallback(`prompts/${typeKey}.txt`);
  const promptOut = await runStep(
    messages,
    fillTemplate(promptPrompt.template, { ...vars, file: promptFile })
  );
  if ("status" in promptOut) return promptOut;
  writeLocal(`prompts/${typeKey}.txt`, promptOut.text);
  changed.push({
    path: `${ANALYZERS_PREFIX}/prompts/${typeKey}.txt`,
    relative: `prompts/${typeKey}.txt`,
    content: promptOut.text,
  });

  const fieldMeta = await readFileWithFallback("field_meta.json");
  const metaOut = await runStep(
    messages,
    fillTemplate(fieldMetaPrompt.template, { ...vars, file: fieldMeta })
  );
  if ("status" in metaOut) return metaOut;
  const parsedMeta = catalogFromFieldMeta(metaOut.text);
  if ("status" in parsedMeta) {
    return jsonError(502, "Chat Completions returned invalid field_meta.json.", {
      detail: parsedMeta.body.error,
    });
  }
  const merged: Catalog = {
    types: parsedMeta.types.map((item) =>
      item.key === typeKey ? { ...item, guidance: selected.guidance, name: selected.name } : item
    ),
  };
  if (!merged.types.some((item) => item.key === typeKey)) {
    merged.types.push(selected);
  }
  const nativeMeta = serializeFieldMeta(merged);
  writeLocal("field_meta.json", nativeMeta);
  writeGuidanceMap(merged.types);
  changed.push({
    path: `${ANALYZERS_PREFIX}/field_meta.json`,
    relative: "field_meta.json",
    content: nativeMeta,
  });

  const manifest = await readFileWithFallback("manifest.json");
  const manifestOut = await runStep(
    messages,
    fillTemplate(manifestPrompt.template, {
      typeKey,
      fieldMeta: nativeMeta,
      file: manifest,
    })
  );
  if ("status" in manifestOut) return manifestOut;
  writeLocal("manifest.json", manifestOut.text);
  changed.push({ path: `${ANALYZERS_PREFIX}/manifest.json`, relative: "manifest.json", content: manifestOut.text });

  const committed = await commitFilesToGitHub(
    changed.map((file) => ({ path: file.path, content: file.content })),
    `feat(analyzers): add ${typeKey} from PACCA Solutions V2`
  );
  if (committed.status >= 400) return committed;

  return {
    status: 201,
    body: {
      ok: true,
      typeKey,
      model,
      steps: [
        "type_catalog.txt",
        "schemas/_classification.json",
        `schemas/${typeKey}.json`,
        `prompts/${typeKey}.txt`,
        "field_meta.json",
        "manifest.json",
        "github",
      ],
      types: merged.types,
      ...committed.body,
    },
  };
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
