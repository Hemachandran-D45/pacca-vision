/**
 * Fails if any file under api/ or server/ has an extensionless relative import.
 *
 * These directories ship to Vercel UNBUNDLED: the platform compiles each file to
 * ESM and Node then requires an explicit extension on every relative specifier.
 * An extensionless import type-checks, runs under tsx, and survives an esbuild
 * bundle - then dies in production with
 *
 *   ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/server/senderra/api'
 *
 * which is a ~150ms FUNCTION_INVOCATION_FAILED with no response body. That cost
 * a lot of debugging once; this check makes it a build failure instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["api", "server"];
const SPEC = /\bfrom\s+"(\.[^"]*)"/g;
const OK = [".js", ".json", ".css", ".ts", ".tsx", ".mjs", ".cjs"];

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const bad = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (!/\.(ts|tsx|mts)$/.test(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const match of line.matchAll(SPEC)) {
        const spec = match[1];
        if (!OK.some((ext) => spec.endsWith(ext))) {
          bad.push(`${file}:${i + 1}  "${spec}"  ->  "${spec}.js"`);
        }
      }
    });
  }
}

if (bad.length > 0) {
  console.error("Extensionless relative imports in unbundled server code:\n");
  for (const entry of bad) console.error("  " + entry);
  console.error(
    "\nNode ESM needs the emitted extension. Append .js (it names the compiled" +
      "\nfile; TypeScript maps it back to the .ts source)."
  );
  process.exit(1);
}
console.log(`esm-imports: ok (${ROOTS.join(", ")})`);
