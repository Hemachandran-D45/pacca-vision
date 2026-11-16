/**
 * Characterization: the HTTP hosts around the API, as they behave today.
 *
 * Two hosts serve the same handlers (TRACKER section 7 collapses them into
 * one Express app):
 *   - Express (`server/app.ts`): production, `pnpm start`, the container
 *   - Vercel functions (`api/`): the dev/test link
 * (The Vite dev-server plugins are the third host; they are dev-only and are
 * not covered here.)
 *
 * The handlers are replaced by echo stubs, so these tests pin only what each
 * host does: which method, route, query, body and headers reach the handler,
 * and what comes back out. The handlers themselves are covered by the
 * routes-*.test.ts files.
 */
import fs from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { method: string; route: string; query: Record<string, string>; body: unknown; headers: Record<string, unknown> };
const senderraCalls: Call[] = [];
let senderraResult: { status: number; body: unknown; headers?: Record<string, string> } = { status: 200, body: { ok: true } };

vi.mock("../../server/senderra/api.js", () => ({
  handleSenderra: async (method: string, route: string, query: URLSearchParams, body: unknown, ctx: { headers?: Record<string, unknown> }) => {
    senderraCalls.push({ method, route, query: Object.fromEntries(query), body, headers: ctx?.headers ?? {} });
    return senderraResult;
  },
}));
const solutionsV2Calls: { method: string; body: unknown; query: Record<string, string> }[] = [];
vi.mock("../../server/solutionsV2Api.js", () => ({
  handleSolutionsV2: async (method: string, body: unknown, query?: URLSearchParams) => {
    solutionsV2Calls.push({ method, body, query: Object.fromEntries(query ?? []) });
    return { status: 200, body: { ok: true, from: "solutions-v2" } };
  },
}));
const solutionsV1Calls: unknown[] = [];
vi.mock("../../server/solutionsApi.js", () => ({
  createSolution: async (body: unknown) => {
    solutionsV1Calls.push(body);
    return { status: 201, body: { ok: true, from: "solutions-v1" } };
  },
}));

const { createApp } = await import("../../server/app.js");
const { ADMIN, DEVELOPER, STAFF, as, configureEnv } = await import("./fakes/env.js");

const cookieFor = (role: string) => (as(role as any) as { cookie?: string }).cookie!;

beforeEach(() => {
  senderraCalls.length = 0;
  solutionsV2Calls.length = 0;
  solutionsV1Calls.length = 0;
  senderraResult = { status: 200, body: { ok: true } };
});

describe("Express (server/app.ts)", () => {
  let server: Server;
  let base: string;
  let staticDir: string;

  beforeAll(async () => {
    configureEnv();
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacca-spa-"));
    fs.writeFileSync(path.join(staticDir, "index.html"), "<!doctype html><title>spa</title>");
    fs.mkdirSync(path.join(staticDir, "assets"));
    fs.writeFileSync(path.join(staticDir, "assets", "app.js"), "console.log(1)");
    server = createApp(staticDir).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(staticDir, { recursive: true, force: true });
  });

  const http = (pathname: string, init: RequestInit = {}) => fetch(`${base}${pathname}`, init);
  const postJson = (pathname: string, body: unknown, headers: Record<string, string> = {}) =>
    http(pathname, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  describe("the SPA", () => {
    it("serves a static file", async () => {
      const res = await http("/assets/app.js");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("console.log(1)");
    });

    it("answers a client-side route with index.html", async () => {
      const res = await http("/documents/ui%2Fx");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/html/);
      expect(await res.text()).toContain("<title>spa</title>");
    });

    it("KNOWN BEHAVIOUR: an unknown /api path gets index.html with a 200, not a JSON 404 (TRACKER section 3)", async () => {
      const res = await http("/api/unknown");
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<title>spa</title>");
    });
  });

  describe("/api/senderra/*", () => {
    it("passes method, route, query, body and headers to the dispatcher", async () => {
      await postJson("/api/senderra/review?x=1", { documentId: "ui/a" }, { cookie: "c=1", "x-api-key": "k" });
      expect(senderraCalls).toEqual([
        {
          method: "POST",
          route: "/review",
          query: { x: "1" },
          body: { documentId: "ui/a" },
          headers: expect.objectContaining({ cookie: "c=1", "x-api-key": "k" }),
        },
      ]);
    });

    it("keeps the path as sent: trailing slashes and nested segments reach the dispatcher unchanged", async () => {
      await http("/api/senderra/health/");
      await http("/api/senderra/observability/gaps?runId=ui");
      await http("/api/senderra");
      expect(senderraCalls.map((c) => c.route)).toEqual(["/health/", "/observability/gaps", "/"]);
    });

    it("answers with the dispatcher's status, body and headers, never cached", async () => {
      senderraResult = { status: 418, body: { ok: false, error: "teapot" }, headers: { "Set-Cookie": "pacca_session=; Max-Age=0" } };
      const res = await http("/api/senderra/me");
      expect(res.status).toBe(418);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("set-cookie")).toBe("pacca_session=; Max-Age=0");
      expect(await res.json()).toEqual({ ok: false, error: "teapot" });
    });

    it("refuses methods other than GET and POST with a JSON 405, before the dispatcher", async () => {
      for (const method of ["PUT", "PATCH", "DELETE"]) {
        const res = await http("/api/senderra/review", { method });
        expect(res.status).toBe(405);
        expect(await res.json()).toEqual({ ok: false, error: `${method} not allowed.` });
      }
      expect(senderraCalls).toEqual([]);
    });

    it("passes a JSON array body as {}", async () => {
      await postJson("/api/senderra/review", [1, 2]);
      expect(senderraCalls[0].body).toEqual({});
    });

    it("passes a GET without a body as {}", async () => {
      await http("/api/senderra/documents");
      expect(senderraCalls[0].body).toEqual({});
    });

    it("KNOWN BEHAVIOUR: a body over 256 kB, or malformed JSON, gets Express's default HTML error page", async () => {
      const big = await postJson("/api/senderra/review", { pad: "x".repeat(300 * 1024) });
      expect(big.status).toBe(413);
      expect(big.headers.get("content-type")).toMatch(/text\/html/);
      const bad = await http("/api/senderra/review", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
      expect(bad.status).toBe(400);
      expect(bad.headers.get("content-type")).toMatch(/text\/html/);
      expect(senderraCalls).toEqual([]);
    });
  });

  describe("/api/solutions-v2 and /api/solutions", () => {
    it.each([
      ["no session", undefined, 401],
      ["Client Staff", STAFF, 403],
    ])("refuses %s", async (_label, role, status) => {
      const res = await http("/api/solutions-v2", { headers: role ? { cookie: cookieFor(role) } : {} });
      expect(res.status).toBe(status);
      expect((await res.json()).ok).toBe(false);
      const v1 = await postJson("/api/solutions", { content: "x" }, role ? { cookie: cookieFor(role) } : {});
      expect(v1.status).toBe(status);
      expect(solutionsV2Calls).toEqual([]);
      expect(solutionsV1Calls).toEqual([]);
    });

    it("passes every method, the body and the query to Solutions V2 for a developer or admin", async () => {
      for (const role of [DEVELOPER, ADMIN]) {
        await http("/api/solutions-v2?x=1", { headers: { cookie: cookieFor(role) } });
      }
      await http("/api/solutions-v2", {
        method: "DELETE",
        headers: { cookie: cookieFor(DEVELOPER), "content-type": "application/json" },
        body: JSON.stringify({ typeKey: "labReport" }),
      });
      await http("/api/solutions-v2", { method: "PUT", headers: { cookie: cookieFor(DEVELOPER) } });
      expect(solutionsV2Calls).toEqual([
        { method: "GET", body: {}, query: { x: "1" } },
        { method: "GET", body: {}, query: { x: "1" } },
        { method: "DELETE", body: { typeKey: "labReport" }, query: {} },
        { method: "PUT", body: {}, query: {} },
      ]);
    });

    it("routes POST /api/solutions to V1", async () => {
      const res = await postJson("/api/solutions", { content: "x" }, { cookie: cookieFor(DEVELOPER) });
      expect(res.status).toBe(201);
      expect(solutionsV1Calls).toEqual([{ content: "x" }]);
    });

    it("KNOWN BEHAVIOUR: GET /api/solutions with a session falls through to index.html", async () => {
      const res = await http("/api/solutions", { headers: { cookie: cookieFor(DEVELOPER) } });
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<title>spa</title>");
    });
  });
});

describe("Vercel functions (api/)", () => {
  type Res = { statusCode: number; headers: Record<string, unknown>; body: unknown; ended: boolean } & Record<string, any>;
  const fakeRes = (): Res => {
    const res: Res = {
      statusCode: 0,
      headers: {},
      body: undefined,
      ended: false,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(body: unknown) {
        res.body = body;
        return res;
      },
      send(body: unknown) {
        res.body = body;
        return res;
      },
      setHeader(name: string, value: unknown) {
        res.headers[name.toLowerCase()] = value;
        return res;
      },
      end() {
        res.ended = true;
        return res;
      },
    };
    return res;
  };
  const call = async (mod: string, req: { method?: string; url?: string; body?: unknown; headers?: Record<string, string>; query?: Record<string, unknown> }) => {
    const { default: handler } = await import(mod);
    const res = fakeRes();
    await handler({ headers: {}, ...req }, res);
    return res;
  };

  beforeEach(() => configureEnv());

  describe("api/senderra/[...route].ts", () => {
    const CATCH_ALL = "../../api/senderra/[...route].js";

    it("takes the route from Vercel's query.route, else from the path", async () => {
      await call(CATCH_ALL, { method: "GET", url: "/api/senderra/observability/gaps?runId=ui", query: { route: ["observability", "gaps"] } });
      await call(CATCH_ALL, { method: "GET", url: "/api/senderra/documents", query: { route: "documents" } });
      await call(CATCH_ALL, { method: "POST", url: "/api/senderra/review", body: { documentId: "ui/a" }, headers: { cookie: "c=1" } });
      expect(senderraCalls.map(({ method, route, query, body }) => ({ method, route, query, body }))).toEqual([
        { method: "GET", route: "/observability/gaps", query: { runId: "ui" }, body: {} },
        { method: "GET", route: "/documents", query: {}, body: {} },
        { method: "POST", route: "/review", query: {}, body: { documentId: "ui/a" } },
      ]);
      expect(senderraCalls[2].headers).toMatchObject({ cookie: "c=1" });
    });

    it("prefers query.route when it disagrees with the path (a rewritten request)", async () => {
      await call(CATCH_ALL, { method: "GET", url: "/api/senderra/%5B...route%5D?runId=ui", query: { route: ["documents"] } });
      expect(senderraCalls[0]).toMatchObject({ route: "/documents", query: { runId: "ui" } });
    });

    it("answers OPTIONS with 204 and the allowed methods, and other methods with 405", async () => {
      const options = await call(CATCH_ALL, { method: "OPTIONS", url: "/api/senderra/x" });
      expect(options).toMatchObject({ statusCode: 204, ended: true, headers: { allow: "GET, POST, OPTIONS" } });
      const put = await call(CATCH_ALL, { method: "PUT", url: "/api/senderra/x" });
      expect(put).toMatchObject({ statusCode: 405, body: { ok: false, error: "PUT not allowed." } });
      expect(senderraCalls).toEqual([]);
    });

    it("answers with the dispatcher's status, body and headers, never cached", async () => {
      senderraResult = { status: 201, body: { ok: true }, headers: { "Set-Cookie": "a=b" } };
      const res = await call(CATCH_ALL, { method: "POST", url: "/api/senderra/login", body: "not an object" });
      expect(res).toMatchObject({ statusCode: 201, body: { ok: true }, headers: { "cache-control": "no-store", "set-cookie": "a=b" } });
      expect(senderraCalls[0].body).toEqual({});
    });
  });

  it.each([
    ["observability/index", "GET", "/observability"],
    ["observability/gaps", "GET", "/observability/gaps"],
    ["observability/chat", "POST", "/observability/chat"],
    ["observability/diagnose", "POST", "/observability/diagnose"],
  ])("api/senderra/%s.ts calls the dispatcher with %s %s, and refuses other methods", async (file, method, route) => {
    const mod = `../../api/senderra/${file}.js`;
    const ok = await call(mod, { method, url: `/api/senderra/${route}?runId=ui`, body: { q: 1 } });
    expect(ok).toMatchObject({ statusCode: 200, headers: { "cache-control": "no-store" } });
    expect(senderraCalls[0]).toMatchObject({ method, route, query: { runId: "ui" }, body: method === "GET" ? {} : { q: 1 } });

    const other = method === "GET" ? "POST" : "GET";
    expect(await call(mod, { method: other, url: "/" })).toMatchObject({ statusCode: 405 });
    expect(await call(mod, { method: "OPTIONS", url: "/" })).toMatchObject({ statusCode: 204, headers: { allow: `${method}, OPTIONS` } });
  });

  describe("api/solutions-v2.ts", () => {
    const MOD = "../../api/solutions-v2.js";

    it("needs a developer session", async () => {
      expect(await call(MOD, { method: "GET", url: "/api/solutions-v2" })).toMatchObject({ statusCode: 401 });
      expect(await call(MOD, { method: "GET", url: "/api/solutions-v2", headers: { cookie: cookieFor(STAFF) } })).toMatchObject({ statusCode: 403 });
      expect(solutionsV2Calls).toEqual([]);
    });

    it("passes the method, body and query through, never cached", async () => {
      const res = await call(MOD, { method: "PATCH", url: "/api/solutions-v2?x=1", body: { types: [] }, headers: { cookie: cookieFor(DEVELOPER) } });
      expect(res).toMatchObject({ statusCode: 200, headers: { "cache-control": "no-store" }, body: { from: "solutions-v2" } });
      expect(solutionsV2Calls).toEqual([{ method: "PATCH", body: { types: [] }, query: { x: "1" } }]);
    });

    it("answers OPTIONS without a session", async () => {
      expect(await call(MOD, { method: "OPTIONS" })).toMatchObject({ statusCode: 204, headers: { allow: "GET, POST, PATCH, DELETE, OPTIONS" } });
    });
  });

  describe("api/index.ts (Solutions V1)", () => {
    const MOD = "../../api/index.js";

    it("needs a developer session, then answers POST /api/solutions", async () => {
      expect(await call(MOD, { method: "POST", url: "/api/solutions" })).toMatchObject({ statusCode: 401 });
      const res = await call(MOD, { method: "POST", url: "/api/solutions", body: { content: "x" }, headers: { cookie: cookieFor(DEVELOPER) } });
      expect(res).toMatchObject({ statusCode: 201, body: { from: "solutions-v1" } });
    });

    it("is a 404 for anything else", async () => {
      const res = await call(MOD, { method: "GET", url: "/api/solutions", headers: { cookie: cookieFor(DEVELOPER) } });
      expect(res).toMatchObject({ statusCode: 404, body: { message: "Not found" } });
    });
  });

  it("api/ping.ts reports which variables are present, never their values", async () => {
    const res = await call("../../api/ping.js", { method: "GET" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      node: process.version,
      envPresent: { COSMOS_ENDPOINT: true, COSMOS_KEY: true, AZURE_STORAGE_ACCOUNT: true, AZURE_STORAGE_KEY: true },
    });
    expect(JSON.stringify(res.body)).not.toContain("fake-cosmos-key");
  });
});
