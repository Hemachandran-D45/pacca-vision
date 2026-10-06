import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { handleSenderra } = await import("../../server/senderra/api.js");
const { ADMIN, STAFF, contextFrom, sessionCookie, signSession } = await import("../../server/auth.js");

const SECRET = "m".repeat(40);
const as = (role: any, email = "u@emids.com") =>
  contextFrom({ cookie: sessionCookie(signSession({ email, name: "U", role }, SECRET)).split(";")[0] });

let calls: { url: URL; init: RequestInit }[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };

beforeEach(() => {
  calls = [];
  reply = { status: 200, body: {} };
  for (const [k, v] of Object.entries({
    PACCA_JWT_SECRET: SECRET,
    COSMOS_ENDPOINT: "https://c.documents.azure.com:443/",
    COSMOS_KEY: "k",
    AZURE_STORAGE_ACCOUNT: "a",
    AZURE_STORAGE_KEY: "k",
    SENDERRA_FUNCTION_URL: "https://func.example.net",
    SENDERRA_FUNCTION_KEY: "fn-key",
  })) vi.stubEnv(k, v);
  vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
    calls.push({ url: new URL(url), init });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const q = new URLSearchParams();

describe("model proxy", () => {
  it("lists models with the function key, server-side only", async () => {
    reply.body = { default: "gpt-5.4-mini", models: [{ id: "gpt-5.4-mini" }] };
    const res = await handleSenderra("GET", "/models", q, {}, as(STAFF));
    expect(res.status).toBe(200);
    expect(calls[0].url.pathname).toBe("/api/models");
    expect(calls[0].url.searchParams.get("code")).toBe("fn-key");
    expect(JSON.stringify(res.body)).not.toContain("fn-key");
  });

  it("history only for admins", async () => {
    await handleSenderra("GET", "/llm-settings", q, {}, as(STAFF));
    await handleSenderra("GET", "/llm-settings", q, {}, as(ADMIN));
    expect(calls[0].url.searchParams.get("history")).toBeNull();
    expect(calls[1].url.searchParams.get("history")).toBe("20");
  });

  it("switching is admin-only", async () => {
    const res = await handleSenderra("POST", "/llm-settings", q, { model: "gpt-5.6-luna" }, as(STAFF));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("forwards a switch as PUT with updated_by from the session", async () => {
    reply.body = { stored: { model: "gpt-5.6-luna" } };
    const res = await handleSenderra(
      "POST", "/llm-settings", q,
      { model: "gpt-5.6-luna", reasoning_effort: "low", reason: "test", updated_by: "forged@emids.com", etag: "e1" },
      as(ADMIN, "pacca.admin@emids.com"),
    );
    expect(res.status).toBe(200);
    expect(calls[0].init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      model: "gpt-5.6-luna", reasoning_effort: "low", reason: "test", etag: "e1", updated_by: "pacca.admin@emids.com",
    });
  });

  it("passes the Function App's refusal through", async () => {
    reply = { status: 422, body: { error: "kimi-k2.6: disabled in models.json" } };
    const res = await handleSenderra("POST", "/llm-settings", q, { model: "kimi-k2.6" }, as(ADMIN));
    expect(res).toMatchObject({ status: 422, body: { ok: false, error: "kimi-k2.6: disabled in models.json" } });
  });

  it("rejects a non-id model before calling out", async () => {
    const res = await handleSenderra("POST", "/llm-settings", q, { model: "https://evil/v1" }, as(ADMIN));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("503 with a clear message when the FA is not configured", async () => {
    vi.stubEnv("SENDERRA_FUNCTION_KEY", "");
    const res = await handleSenderra("GET", "/models", q, {}, as(STAFF));
    expect(res.status).toBe(503);
  });
});
