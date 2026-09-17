import fs from "fs";
import path from "path";
import { isConfigError, readConfig, type SenderraConfig } from "./config.js";

/** In-memory cache with 5-minute TTL to ensure fast lookups while picking up runtime changes */
type CacheEntry = {
  schema: Record<string, unknown>;
  cachedAt: number;
  source: "blob" | "cosmos" | "local";
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Resolves local schema fallback path */
function getLocalSchemaPath(docType: string): string {
  const cleanType = docType.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(process.cwd(), "analyzers", "out", "schemas", `${cleanType}.json`);
}

/** Reads schema from local disk fallback */
function readLocalSchema(docType: string): Record<string, unknown> | null {
  try {
    const filePath = getLocalSchemaPath(docType);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Fetches dynamic schema from Azure Blob Storage */
async function fetchSchemaFromBlob(
  config: SenderraConfig,
  docType: string
): Promise<Record<string, unknown> | null> {
  try {
    const { BlobServiceClient, StorageSharedKeyCredential } = await import("@azure/storage-blob");
    const cred = new StorageSharedKeyCredential(config.storageAccount, config.storageKey);
    const client = new BlobServiceClient(
      `https://${config.storageAccount}.blob.core.windows.net`,
      cred
    );

    // Checks 'schemas' container first, then root storage
    const containerClient = client.getContainerClient("schemas");
    const blobClient = containerClient.getBlobClient(`${docType}.json`);

    const exists = await blobClient.exists();
    if (!exists) return null;

    const downloadResponse = await blobClient.download();
    const downloaded = await streamToBuffer(downloadResponse.readableStreamBody!);
    return JSON.parse(downloaded.toString("utf-8"));
  } catch {
    return null;
  }
}

/** Helper to read download stream */
async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on("data", (data) => {
      chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
    });
    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on("error", reject);
  });
}

/**
 * Main dynamic schema loader:
 * 1. Checks in-memory cache (5-min TTL)
 * 2. Fetches from Azure Blob Storage (runtime dynamic store)
 * 3. Falls back to local analyzer schema definition
 *
 * This allows the backend extraction pipeline and UI to receive schema updates
 * in real-time without redeploying the Azure Function App or API server.
 */
export async function getDynamicSchema(
  docType: string,
  bypassCache = false
): Promise<{
  ok: boolean;
  docType: string;
  source: "blob" | "cosmos" | "local" | "none";
  schema: Record<string, unknown> | null;
}> {
  const normalizedType = docType.trim();

  // 1. Cache hit
  if (!bypassCache) {
    const cached = cache.get(normalizedType);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return { ok: true, docType: normalizedType, source: cached.source, schema: cached.schema };
    }
  }

  // 2. Azure Blob Storage (Dynamic Cloud Store)
  const config = readConfig();
  if (!isConfigError(config)) {
    const blobSchema = await fetchSchemaFromBlob(config, normalizedType);
    if (blobSchema) {
      cache.set(normalizedType, { schema: blobSchema, cachedAt: Date.now(), source: "blob" });
      return { ok: true, docType: normalizedType, source: "blob", schema: blobSchema };
    }
  }

  // 3. Local Analyzer Fallback
  const localSchema = readLocalSchema(normalizedType);
  if (localSchema) {
    cache.set(normalizedType, { schema: localSchema, cachedAt: Date.now(), source: "local" });
    return { ok: true, docType: normalizedType, source: "local", schema: localSchema };
  }

  return { ok: false, docType: normalizedType, source: "none", schema: null };
}

/** Invalidates cache for a single schema or all schemas */
export function invalidateSchemaCache(docType?: string) {
  if (docType) {
    cache.delete(docType.trim());
  } else {
    cache.clear();
  }
}

/**
 * Utility: Uploads all local analyzer schemas to Azure Blob Storage
 * so Azure Function Apps can immediately fetch them dynamically.
 */
export async function syncSchemasToBlob(): Promise<{
  ok: boolean;
  uploaded: string[];
  failed: string[];
  error?: string;
}> {
  const config = readConfig();
  if (isConfigError(config)) {
    return { ok: false, uploaded: [], failed: [], error: config.error };
  }

  try {
    const { BlobServiceClient, StorageSharedKeyCredential } = await import("@azure/storage-blob");
    const cred = new StorageSharedKeyCredential(config.storageAccount, config.storageKey);
    const client = new BlobServiceClient(
      `https://${config.storageAccount}.blob.core.windows.net`,
      cred
    );

    const containerClient = client.getContainerClient("schemas");
    await containerClient.createIfNotExists();

    const schemasDir = path.join(process.cwd(), "analyzers", "out", "schemas");
    if (!fs.existsSync(schemasDir)) {
      return { ok: false, uploaded: [], failed: [], error: "analyzers/out/schemas directory not found" };
    }

    const files = fs.readdirSync(schemasDir).filter((f) => f.endsWith(".json"));
    const uploaded: string[] = [];
    const failed: string[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(schemasDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const blobClient = containerClient.getBlockBlobClient(file);
        await blobClient.upload(content, content.length, {
          blobHTTPHeaders: { blobContentType: "application/json" },
        });
        uploaded.push(file);
      } catch {
        failed.push(file);
      }
    }

    // Invalidate local memory cache to pick up newly synced schemas
    invalidateSchemaCache();

    return { ok: true, uploaded, failed };
  } catch (err) {
    return {
      ok: false,
      uploaded: [],
      failed: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
