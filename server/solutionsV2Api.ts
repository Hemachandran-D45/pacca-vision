import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Container } from "@azure/cosmos";
import { solutionsContainer } from "./senderra/cosmos.js";
import { isConfigError, readConfig } from "./senderra/config.js";

const GUIDANCE_FILE = "pacca_guidance.json";
// How long to wait for the Function App. Under Vercel's 120 s function limit
// (vercel.json maxDuration), and above the Function App's own provisioning budget
// (40 s LLM call + 30 s catalog lock wait + a few seconds; senderra-idp-sol
// shared/solution_llm.py).
export const FA_TIMEOUT_MS = 110_000;

const isTimeout = (error: any) => error?.name === "TimeoutError" || error?.name === "AbortError";

// The Function App may have finished part of the work before failing (e.g. removed
// the Cosmos row, then failed rebuilding the catalog). Its endpoints are safe to
// repeat, so that is what the user is told.
const RETRY_IS_SAFE = "It may have partly completed; reload, then try again (that is safe).";
// The Function App's rules (senderra-idp-sol shared/catalog.py TYPE_KEY_RE / FIELD_NAME_RE).
// Checked here too, so a bad name is refused when it is added, not when it is saved.
const TYPE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const FIELD_NAME_RE = /^[\w.-]{1,64}$/;

export type CatalogField = {
  name: string;
  type: string;
  required: boolean;
  class?: string;
  description?: string;
  criticality?: string | null;
  validation_mode?: string | null;
  validators?: string[];
  aliases?: string[];
  enum?: string[] | null;
  [extra: string]: unknown;
};

export type CatalogType = {
  key: string;
  name: string;
  department?: string;
  guidance: string;
  fields: CatalogField[];
  /** Cosmos `_etag` when read. Sent back on PATCH so a stale edit is refused, not saved over a newer one. */
  etag?: string;
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

function getAppOutDir(): string {
  return path.join(process.cwd(), "analyzers", "out");
}

function getCanonicalOutDir(): string {
  return path.join(getRepoRoot(), "analyzers", "out");
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

function readLocalGuidance(): Record<string, { guidance: string; department?: string }> {
  for (const dir of [getAppOutDir(), getCanonicalOutDir()]) {
    const guidancePath = path.join(dir, GUIDANCE_FILE);
    if (fs.existsSync(guidancePath)) {
      try {
        return JSON.parse(fs.readFileSync(guidancePath, "utf8"));
      } catch {
        // continue
      }
    }
  }
  return {};
}

/**
 * Fetch catalog from Cosmos DB `solutions` container.
 * Falls back to local compiled assets if Cosmos is not yet configured or empty.
 */
export async function getCatalog(): Promise<ApiResult> {
  try {
    const containerRes = await solutionsContainer();
    if (!("error" in containerRes)) {
      const { resources } = await containerRes.items
        .query("SELECT * FROM c ORDER BY c.name ASC")
        .fetchAll();

      if (resources && resources.length > 0) {
        const types: CatalogType[] = resources.map((item: any) => ({
          key: item.typeKey || item.id,
          name: item.name || humanizeKey(item.typeKey || item.id),
          department: item.department || defaultDepartmentForType(item.typeKey || item.id),
          guidance: item.guidance || "",
          // Every stored property goes to the UI and comes back on PATCH as it was:
          // dropping criticality/validators here, or defaulting `class`, makes the
          // next save rewrite them.
          fields: (item.fields || []).map((f: any) => ({
            ...f,
            type: typeof f.type === "string" ? f.type : "string",
            required: Boolean(f.required),
          })),
          etag: item._etag,
        }));
        return { status: 200, body: { ok: true, types } };
      }
    }

    // Fallback: read from local field_meta.json
    for (const dir of [getAppOutDir(), getCanonicalOutDir()]) {
      const fieldMetaPath = path.join(dir, "field_meta.json");
      if (fs.existsSync(fieldMetaPath)) {
        const raw = fs.readFileSync(fieldMetaPath, "utf8");
        const parsed = JSON.parse(raw) as Record<string, Record<string, any>>;
        const guidance = readLocalGuidance();
        const types: CatalogType[] = [];

        for (const [key, fieldsObj] of Object.entries(parsed)) {
          if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) continue;
          const fields: CatalogField[] = [];
          for (const [fieldName, fieldData] of Object.entries(fieldsObj)) {
            if (fieldName.startsWith("_")) continue;
            fields.push({
              name: fieldName,
              type: typeof fieldData.type === "string" ? fieldData.type : "string",
              required: Boolean(fieldData.required),
              class: typeof fieldData.class === "string" ? fieldData.class : "A",
              description: fieldData.description,
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
      }
    }

    return { status: 200, body: { ok: true, types: [] } };
  } catch (error: any) {
    return jsonError(500, error?.message || "Could not retrieve document catalog.");
  }
}

/**
 * The `solutions` container, if it may be written to; otherwise the error to answer.
 *
 * An empty container is refused, not just a missing one. GET then shows the
 * bundled analyzers/out types, so the page looks normal, but provisioning one of
 * them makes it the only provisioned row: the Function App rebuilds the
 * classification catalog from that row alone and the pipeline stops knowing
 * every other type. The container has to be seeded first.
 */
async function writableSolutions(): Promise<Container | ApiResult> {
  const containerRes = await solutionsContainer();
  if ("error" in containerRes) {
    // Saving to local disk instead would report success and lose the edit on the next restart.
    return jsonError(503, `Solutions storage is not available: ${containerRes.error}`, {
      missing: containerRes.missing,
    });
  }
  const { resources } = await containerRes.items.query<number>("SELECT VALUE COUNT(1) FROM c").fetchAll();
  if (!resources[0]) {
    return jsonError(
      503,
      "The solutions catalog in Cosmos is empty. Seed it (pnpm seed:solutions) before editing or saving document types."
    );
  }
  return containerRes;
}

const isResult = (value: Container | ApiResult): value is ApiResult => "status" in value && "body" in value;

/**
 * Save draft edits for the types in the body (the UI sends only the one being
 * edited) to the Cosmos `solutions` container. Types not in the body are not
 * touched, so two people editing different types cannot overwrite each other.
 * When a type carries the `etag` it was read with, the write is conditional on
 * it: a stale edit gets a 409 instead of silently replacing a newer one.
 *
 * The pipeline does not see these edits until the type is provisioned (POST).
 */
const CatalogFieldSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.string().min(1).max(60).optional().default("string"),
  required: z.boolean().optional().default(false),
  class: z.string().optional(),
  description: z.string().optional(),
  criticality: z.string().nullable().optional(),
  validation_mode: z.string().nullable().optional(),
  validators: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  enum: z.array(z.string()).nullable().optional(),
});

const CatalogTypeSchema = z.object({
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Type key must be alphanumeric/underscore starting with a letter."),
  name: z.string().min(1).max(120).optional(),
  department: z.string().optional(),
  guidance: z.string().max(10000).optional().default(""),
  fields: z.array(CatalogFieldSchema).optional().default([]),
});

const CatalogPatchSchema = z.object({
  types: z.array(CatalogTypeSchema).max(100),
});

export async function patchCatalog(body: any): Promise<ApiResult> {
  if (!body || typeof body !== "object" || !Array.isArray(body.types)) {
    return jsonError(400, "Request body must have a types array.");
  }
  const parsed = CatalogPatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message || "Request body must have a valid types array.");
  }
  const types: CatalogType[] = body.types;
  for (const t of types) {
    if (!t || typeof t.key !== "string" || !TYPE_KEY_RE.test(t.key) || t.key.length > 64) {
      return jsonError(400, `Invalid type key '${t?.key}'.`);
    }
    if (!Array.isArray(t.fields)) return jsonError(400, `Type '${t.key}' must have a fields array.`);
    const badField = t.fields.find((f) => typeof f?.name !== "string" || !FIELD_NAME_RE.test(f.name));
    if (badField) {
      return jsonError(
        400,
        `Invalid field name '${badField?.name}'. Use letters, digits, _ . or - only (no spaces), up to 64 characters.`
      );
    }
  }

  try {
    const containerRes = await writableSolutions();
    if (isResult(containerRes)) return containerRes;

    for (const t of types) {
      const { resource: existing } = await containerRes.item(t.key, t.key).read<any>();

      // Merge field definitions so stored metadata the UI does not send is kept.
      const existingFieldMap = new Map<string, any>((existing?.fields || []).map((f: any) => [f.name, f]));
      const mergedFields = t.fields.map((f: any) => {
        const prev = existingFieldMap.get(f.name);
        return prev ? { ...prev, ...f } : f;
      });

      const item = {
        ...(existing || {}),
        id: t.key,
        typeKey: t.key,
        name: t.name || humanizeKey(t.key),
        department: t.department || defaultDepartmentForType(t.key),
        guidance: t.guidance || "",
        fields: mergedFields,
        version: existing?.version || 1,
      };

      const options =
        existing && t.etag ? { accessCondition: { type: "IfMatch", condition: t.etag } } : undefined;
      try {
        await containerRes.items.upsert(item, options);
      } catch (error: any) {
        if (error?.code === 412) {
          return jsonError(
            409,
            `"${item.name}" was changed by someone else since you opened it. Reload to see their changes, then edit again.`
          );
        }
        throw error;
      }
    }

    return await getCatalog();
  } catch (error: any) {
    return jsonError(500, `Failed to save changes to Cosmos DB: ${error?.message || error}`);
  }
}

/**
 * Delegate solution generation and compilation to the Azure Function App.
 * The Function App runs the LLM, compiles schemas/prompts, updates the file share,
 * and updates Cosmos DB.
 */
export async function saveDocumentType(body: any): Promise<ApiResult> {
  const typeKey = String(body?.typeKey ?? "").trim();
  if (!typeKey) return jsonError(400, "typeKey is required.");

  // 1. Fetch current definition from Cosmos DB (never the bundled fallback; see writableSolutions)
  try {
    const writable = await writableSolutions();
    if (isResult(writable)) return writable;
  } catch (error: any) {
    return jsonError(500, `Could not read the solutions catalog: ${error?.message || error}`);
  }
  const catalogRes = await getCatalog();
  const types = (catalogRes.body.types as CatalogType[]) ?? [];
  const selected = types.find((t) => t.key === typeKey);

  if (!selected) {
    return jsonError(404, `Document type '${typeKey}' was not found in catalog.`);
  }

  if (!selected.fields || selected.fields.length === 0) {
    return jsonError(400, `Document type '${typeKey}' must have at least one field.`);
  }

  // 2. Call Function App
  const config = readConfig();
  if (isConfigError(config)) {
    return jsonError(503, config.error, { missing: config.missing });
  }

  if (!config.functionUrl || !config.functionKey) {
    return jsonError(503, "Solution provisioning requires SENDERRA_FUNCTION_URL and SENDERRA_FUNCTION_KEY configured on the server.");
  }

  const payload = {
    typeKey: selected.key,
    name: selected.name,
    department: selected.department,
    guidance: selected.guidance,
    fields: selected.fields,
  };

  const url = new URL("/api/solutions/provision", config.functionUrl);
  url.searchParams.set("code", config.functionKey);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-functions-key": config.functionKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FA_TIMEOUT_MS),
    });
  } catch (error: any) {
    if (isTimeout(error)) {
      return jsonError(
        504,
        `The Function App did not answer within ${FA_TIMEOUT_MS / 1000} s. The save may still complete: reload in a minute before saving again.`
      );
    }
    return jsonError(502, `Function App unreachable: ${error?.message || String(error)}`);
  }

  let resBody: Record<string, unknown> = {};
  try {
    resBody = (await response.json()) as Record<string, unknown>;
  } catch {
    return jsonError(502, `Function App returned status ${response.status} with a non-JSON body.`);
  }

  if (!response.ok) {
    return jsonError(
      response.status,
      String(resBody.error || `Function App provisioning failed with status ${response.status}.`)
    );
  }

  // 3. Refresh catalog from DB to get the latest compiled state
  const refreshed = await getCatalog();

  return {
    status: 200,
    body: {
      ok: true,
      typeKey,
      compiledAt: resBody.compiledAt,
      version: resBody.version,
      // The pipeline loads new assets on its next cold start or restart, and the
      // Function App falls back to deterministic text when its LLM call fails. The
      // UI has to say both instead of "analyzer generated".
      restartRequired: resBody.restartRequired === true,
      llmFallback: resBody.llmFallback === true,
      message: typeof resBody.message === "string" ? resBody.message : undefined,
      steps: [
        "fa_called",
        "llm_generated_by_function_app",
        "schemas_and_prompts_compiled",
        "assets_persisted_to_fileshare",
        "cosmos_db_updated",
      ],
      types: refreshed.body.types,
    },
  };
}

/**
 * Delete a document type. The Function App removes the Cosmos row and the type's
 * schema and prompt from the file share, then rebuilds the global assets. If it
 * fails, nothing is deleted here either: deleting only the Cosmos row would hide
 * the type in the UI while the pipeline keeps classifying into it.
 */
export async function deleteDocumentType(body: any): Promise<ApiResult> {
  const typeKey = String(body?.typeKey ?? "").trim();
  if (!typeKey) return jsonError(400, "typeKey is required.");

  const config = readConfig();
  if (isConfigError(config)) {
    return jsonError(503, config.error, { missing: config.missing });
  }
  if (!config.functionUrl || !config.functionKey) {
    return jsonError(503, "Deleting a solution requires SENDERRA_FUNCTION_URL and SENDERRA_FUNCTION_KEY configured on the server.");
  }

  const url = new URL("/api/solutions/delete", config.functionUrl);
  url.searchParams.set("code", config.functionKey);
  url.searchParams.set("typeKey", typeKey);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-functions-key": config.functionKey,
      },
      body: JSON.stringify({ typeKey }),
      signal: AbortSignal.timeout(FA_TIMEOUT_MS),
    });
  } catch (error: any) {
    if (isTimeout(error)) {
      return jsonError(
        504,
        `The Function App did not answer within ${FA_TIMEOUT_MS / 1000} s. The delete may still complete: reload in a minute.`
      );
    }
    return jsonError(502, `Function App unreachable: ${error?.message || String(error)}. ${RETRY_IS_SAFE}`);
  }

  let resBody: Record<string, unknown> = {};
  try {
    resBody = (await response.json()) as Record<string, unknown>;
  } catch {
    return jsonError(502, `Function App returned status ${response.status} with a non-JSON body. ${RETRY_IS_SAFE}`);
  }
  if (!response.ok) {
    return jsonError(
      response.status,
      `${String(resBody.error || `Function App delete failed with status ${response.status}.`)} ${RETRY_IS_SAFE}`
    );
  }

  const catalog = await getCatalog();
  return {
    status: 200,
    body: {
      ok: true,
      typeKey,
      restartRequired: resBody.restartRequired === true,
      message: typeof resBody.message === "string" ? resBody.message : undefined,
      types: catalog.body.types,
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
