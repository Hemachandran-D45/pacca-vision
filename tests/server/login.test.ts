import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory `users` container standing in for Cosmos.
const store = new Map<string, any>();
const fakeContainer = {
  item: (id: string) => ({
    read: async () => {
      if (!store.has(id)) throw Object.assign(new Error("nf"), { code: 404 });
      return { resource: structuredClone(store.get(id)) };
    },
  }),
  items: { upsert: async (item: any) => { store.set(item.id, structuredClone(item)); return { resource: item }; } },
};
vi.mock("../../server/senderra/cosmos.js", async (orig) => ({
  ...(await orig<object>()),
  usersContainer: async () => fakeContainer,
}));

const { upsertUser, login, MAX_FAILED_LOGINS } = await import("../../server/senderra/users.js");
const { handleSenderra } = await import("../../server/senderra/api.js");
const { contextFrom, ADMIN, STAFF } = await import("../../server/auth.js");

beforeEach(async () => {
  vi.stubEnv("PACCA_JWT_SECRET", "s".repeat(40));
  store.clear();
  await upsertUser(fakeContainer as any, { email: "Pacca.Admin@emids.com", name: "PACCA Admin", role: ADMIN, password: "Paccavision@123" });
});
afterEach(() => vi.unstubAllEnvs());

describe("login", () => {
  it("accepts the right password, case-insensitive email", async () => {
    const r = await login("PACCA.ADMIN@emids.com", "Paccavision@123");
    expect(r).toEqual({ ok: true, user: { email: "pacca.admin@emids.com", name: "PACCA Admin", role: ADMIN } });
  });

  it("rejects other domains before touching the store", async () => {
    expect(await login("pacca.admin@gmail.com", "x")).toMatchObject({ ok: false, status: 400 });
  });

  it("gives the same answer for an unknown user and a wrong password", async () => {
    const unknown = await login("nobody@emids.com", "Paccavision@123");
    const wrong = await login("pacca.admin@emids.com", "nope");
    expect(unknown).toEqual(wrong);
  });

  it("locks after repeated failures, even for the right password", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login("pacca.admin@emids.com", "nope");
    expect(await login("pacca.admin@emids.com", "Paccavision@123")).toMatchObject({ ok: false, status: 423 });
  });

  it("never stores the password", () => {
    expect(JSON.stringify([...store.values()])).not.toContain("Paccavision@123");
  });

  it("refuses to seed a non-emids account or a short password", async () => {
    await expect(upsertUser(fakeContainer as any, { email: "a@gmail.com", name: "a", role: STAFF, password: "longenough" })).rejects.toThrow();
    await expect(upsertUser(fakeContainer as any, { email: "a@emids.com", name: "a", role: STAFF, password: "short" })).rejects.toThrow();
  });
});

describe("session routes", () => {
  it("login sets the cookie, /me reads it, logout clears it", async () => {
    const res = await handleSenderra("POST", "/login", new URLSearchParams(), { email: "pacca.admin@emids.com", password: "Paccavision@123" });
    expect(res.status).toBe(200);
    const cookie = res.headers!["Set-Cookie"];
    expect(cookie).toMatch(/^pacca_session=.+HttpOnly/);

    const me = await handleSenderra("GET", "/me", new URLSearchParams(), {}, contextFrom({ cookie: cookie.split(";")[0] }));
    expect(me.body).toMatchObject({ ok: true, user: { role: ADMIN } });

    const out = await handleSenderra("POST", "/logout", new URLSearchParams(), {});
    expect(out.headers!["Set-Cookie"]).toContain("Max-Age=0");
    expect((await handleSenderra("GET", "/me", new URLSearchParams(), {})).status).toBe(401);
  });

  it("a wrong password sets no cookie", async () => {
    const res = await handleSenderra("POST", "/login", new URLSearchParams(), { email: "pacca.admin@emids.com", password: "x" });
    expect(res.status).toBe(401);
    expect(res.headers).toBeUndefined();
  });
});
