import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteTypeFromFileShare, uploadAssetsToFileShare } from "../../server/azureFileShare.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCANNED = ["server", "api", "shared", "client/src"];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

describe("no hardcoded secrets", () => {
  // Storage account keys and Azure OpenAI keys are 40+ chars of base64/alnum.
  // Two shipped as `process.env.X || "<key>"` fallbacks (13da57e).
  const KEY_LITERAL = /["'`]([A-Za-z0-9+/]{40,}={0,2})["'`]/;
  const CONNECTION_STRING_KEY = /AccountKey=[A-Za-z0-9+/]{20,}/;

  it.each(SCANNED)("%s has no key-shaped string literals", (dir) => {
    const offenders = sourceFiles(path.join(ROOT, dir)).flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${path.relative(ROOT, file)}:${i + 1}` }))
        .filter(({ line }) => KEY_LITERAL.test(line) || CONNECTION_STRING_KEY.test(line))
        .map(({ at }) => at)
    );
    expect(offenders).toEqual([]);
  });
});

describe("Azure Files without AZURE_STORAGE_KEY", () => {
  afterEach(() => vi.unstubAllEnvs());

  // With the key unset these must fail fast with a config error. Before the
  // fix they silently fell back to an embedded key and called Azure.
  it("upload reports missing credentials instead of using an embedded key", async () => {
    vi.stubEnv("AZURE_STORAGE_KEY", "");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assets-"));
    const result = await uploadAssetsToFileShare(dir);
    expect(result).toMatchObject({ ok: false, error: "Azure Storage credentials not configured." });
  });

  it("delete reports missing credentials instead of using an embedded key", async () => {
    vi.stubEnv("AZURE_STORAGE_KEY", "");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await deleteTypeFromFileShare("anyType");
    expect(result).toMatchObject({ ok: false, error: "Azure Storage credentials not configured." });
    errors.mockRestore();
  });
});
