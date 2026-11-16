import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIST = path.join(ROOT, "dist");

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(path.join(dir, entry.name)).map((f) => path.join(entry.name, f)) : [entry.name]
  );
}

/*
 * The bundled server resolves prompt templates next to itself
 * (`dirname(import.meta.url)/prompts`), i.e. dist/prompts. Vercel and
 * `vite dev` run the unbundled sources, so only `pnpm start` and the
 * container ever look there - which is how a build without them shipped.
 */
const PNPM = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

describe("server bundle (pnpm run build:server)", () => {
  beforeAll(() => {
    execFileSync(PNPM, ["run", "-s", "build:server"], { cwd: ROOT, stdio: "pipe", shell: process.platform === "win32" });
  }, 60_000);

  it("emits dist/index.js", () => {
    expect(fs.existsSync(path.join(DIST, "index.js"))).toBe(true);
  });

  it("ships every server prompt template under dist/prompts", () => {
    const source = files(path.join(ROOT, "server", "prompts")).sort();
    expect(source.length).toBeGreaterThan(0);
    expect(files(path.join(DIST, "prompts")).sort()).toEqual(source);
  });

  it("does not nest prompts/prompts on a rebuild", () => {
    execFileSync(PNPM, ["run", "-s", "build:server"], { cwd: ROOT, stdio: "pipe", shell: process.platform === "win32" });
    expect(fs.existsSync(path.join(DIST, "prompts", "prompts"))).toBe(false);
  }, 60_000);
});

describe("built server (node dist/index.js)", () => {
  it("serves /healthz and exits 0 on SIGTERM", async () => {
    const port = 40000 + Math.floor(Math.random() * 20000);
    const child = spawn(process.execPath, [path.join(DIST, "index.js")], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));

    const isWin = process.platform === "win32";
    for (let i = 0; i < 100 && !output.includes("Server running"); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(output).toContain("Server running");

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(health.status).toBe(200);

    if (isWin) {
      child.kill();
    } else {
      child.kill("SIGTERM");
      expect(await exited).toBe(0);
      expect(output).toContain("SIGTERM received; closing server.");
    }
  }, 30_000);
});
