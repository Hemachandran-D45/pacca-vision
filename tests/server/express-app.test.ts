import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Reproduces the incident: a Solutions V2 write that throws (EACCES when
// analyzers/out is not writable) used to crash the whole Express process.
vi.mock("../../server/solutionsV2Api.js", () => ({
  handleSolutionsV2: async () => {
    throw new Error("EACCES: permission denied, open 'analyzers/out/pacca_guidance.json'");
  },
}));

const { createApp } = await import("../../server/app.js");
const { DEVELOPER, sessionCookie, signSession } = await import("../../server/auth.js");

const SECRET = "s".repeat(40);
let server: Server;
let base: string;

beforeAll(async () => {
  vi.stubEnv("PACCA_JWT_SECRET", SECRET);
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "spa-"));
  fs.writeFileSync(path.join(staticDir, "index.html"), "<!doctype html><title>spa</title>");
  server = createApp(staticDir).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => server.close(resolve));
});

const developerCookie = () =>
  sessionCookie(signSession({ email: "dev@emids.com", name: "Dev", role: DEVELOPER }, SECRET)).split(";")[0];

describe("Express app: a throwing async route", () => {
  it("answers 500 with a generic error and keeps serving", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const failed = await fetch(`${base}/api/solutions-v2`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: developerCookie() },
      body: JSON.stringify({ types: [] }),
    });
    expect(failed.status).toBe(500);
    const body = await failed.json();
    expect(body).toEqual({ ok: false, error: "Internal server error." });
    expect(JSON.stringify(body)).not.toContain("EACCES"); // no internals to the browser
    expect(errors).toHaveBeenCalledWith("PATCH /api/solutions-v2 failed:", expect.any(Error));

    // The process is still up and routing.
    const next = await fetch(`${base}/api/senderra/me`);
    expect(next.status).toBe(401);

    errors.mockRestore();
  });
});

describe("Express app: /healthz", () => {
  it("answers 200 without touching any dependency", async () => {
    // No COSMOS_* / AZURE_STORAGE_* in the test env: a probe must not need them.
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("content-security-policy")).toContain("blob.core.windows.net");
    expect(await res.json()).toEqual({ ok: true });
  });
});
