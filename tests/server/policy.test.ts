import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reviewCalls: any[] = [];
vi.mock("../../server/senderra/cosmos.js", async (orig) => ({
  ...(await orig<object>()),
  container: async () => ({ container: {}, config: {} }),
  applyReviewAction: async (_c: unknown, _id: string, action: any) => {
    reviewCalls.push(action);
    return { status: "claimed" };
  },
}));

const { handleSenderra, ROUTE_POLICY } = await import("../../server/senderra/api.js");
const { ADMIN, DEVELOPER, STAFF, ROLE_RANK, contextFrom, sessionCookie, signSession } = await import("../../server/auth.js");

const SECRET = "p".repeat(40);
const as = (role: any) =>
  contextFrom({ cookie: sessionCookie(signSession({ email: "u@emids.com", name: "U", role }, SECRET)).split(";")[0] });
const call = (key: string, ctx = {}, body: Record<string, unknown> = {}) => {
  const [method, route] = key.split(" ");
  return handleSenderra(method, route, new URLSearchParams(), body, ctx);
};

beforeEach(() => {
  vi.stubEnv("PACCA_JWT_SECRET", SECRET);
  reviewCalls.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

const protectedRoutes = Object.entries(ROUTE_POLICY).filter(([, p]) => p !== "public" && p !== "machine");

describe("route policy", () => {
  it.each(protectedRoutes)("%s needs a session", async (key) => {
    expect((await call(key)).status).toBe(401);
  });

  it.each(protectedRoutes)("%s refuses roles below %s", async (key, min) => {
    for (const role of [STAFF, DEVELOPER, ADMIN]) {
      const status = (await call(key, as(role))).status;
      if (ROLE_RANK[role] < ROLE_RANK[min as keyof typeof ROLE_RANK]) expect(status, role).toBe(403);
      else expect([401, 403], role).not.toContain(status);
    }
  });

  it("matches the agreed matrix", () => {
    expect(ROUTE_POLICY["GET /analytics"]).toBe(DEVELOPER);
    expect(ROUTE_POLICY["POST /llm-settings"]).toBe(ADMIN);
    expect(ROUTE_POLICY["GET /observability"]).toBe(DEVELOPER);
    expect(ROUTE_POLICY["POST /upload-sas"]).toBe(STAFF);
    expect(ROUTE_POLICY["GET /health"]).toBe("public");
  });

  it("unlisted routes are 404 even when signed in", async () => {
    expect((await call("GET /secret-admin-thing", as(ADMIN))).status).toBe(404);
  });

  it("the reviewer identity comes from the session, not the body", async () => {
    const res = await call("POST /review", as(STAFF), { documentId: "ui/x", action: "claim", by: "someone.else@emids.com" });
    expect(res.status).toBe(200);
    expect(reviewCalls[0].by).toBe("u@emids.com");
  });

  it("the IVR callback needs its key once configured", async () => {
    vi.stubEnv("IVR_WRITEBACK_API_KEY", "ivr-key");
    expect((await call("POST /ivr-writeback", {}, { documentId: "ui/x" })).status).toBe(401);
    const ok = await call("POST /ivr-writeback", contextFrom({ "x-api-key": "ivr-key" }), { documentId: "ui/x", fields: {} });
    expect(ok.status).toBe(200);
  });
});
