import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN,
  DEVELOPER,
  STAFF,
  authorize,
  authorizeMachine,
  contextFrom,
  hashPassword,
  isAllowedEmail,
  parseCookies,
  sessionCookie,
  signSession,
  verifyPassword,
  verifySession,
} from "../../server/auth.js";

const SECRET = "x".repeat(40);
const admin = { email: "pacca.admin@emids.com", name: "Admin", role: ADMIN };

function ctxFor(user = admin, secret = SECRET) {
  return contextFrom({ cookie: sessionCookie(signSession(user, secret)).split(";")[0] });
}

beforeEach(() => vi.stubEnv("PACCA_JWT_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("passwords", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("Paccavision@123");
    expect(hash.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("Paccavision@123", hash)).toBe(true);
    expect(await verifyPassword("paccavision@123", hash)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
});

describe("email domain", () => {
  it.each([
    ["pacca.admin@emids.com", true],
    ["someone@gmail.com", false],
    ["x@emids.com.evil.io", false],
    ["x@sub.emids.com", false],
    ["", false],
  ])("%s -> %s", (email, ok) => expect(isAllowedEmail(email)).toBe(ok));
});

describe("session tokens", () => {
  const now = 1_800_000_000;

  it("round-trips", () => {
    expect(verifySession(signSession(admin, SECRET, now), SECRET, now + 60)).toEqual(admin);
  });

  it("rejects a wrong secret, a tampered payload, and expiry", () => {
    const token = signSession(admin, SECRET, now);
    expect(verifySession(token, "y".repeat(40), now)).toBeNull();
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: admin.email, role: ADMIN, exp: now + 9e9 })).toString("base64url");
    expect(verifySession(`${h}.${forged}.${s}`, SECRET, now)).toBeNull();
    expect(verifySession(token, SECRET, now + 8 * 3600 + 1)).toBeNull();
  });

  it("refuses alg=none", () => {
    const none = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: admin.email, role: ADMIN, exp: now + 60 })).toString("base64url");
    expect(verifySession(`${none}.${payload}.`, SECRET, now)).toBeNull();
  });

  it("refuses a non-emids subject or unknown role even if signed", () => {
    expect(verifySession(signSession({ ...admin, email: "a@gmail.com" }, SECRET, now), SECRET, now)).toBeNull();
    expect(verifySession(signSession({ ...admin, role: "Root" as never }, SECRET, now), SECRET, now)).toBeNull();
  });

  it("sets a hardened cookie", () => {
    const cookie = sessionCookie("t");
    for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) expect(cookie).toContain(flag);
    expect(parseCookies("a=1; pacca_session=t")).toEqual({ a: "1", pacca_session: "t" });
  });
});

describe("authorize", () => {
  it("503 without a usable secret", () => {
    vi.stubEnv("PACCA_JWT_SECRET", "short");
    expect(authorize(ctxFor(), STAFF)).toMatchObject({ ok: false, status: 503 });
  });

  it("401 without a session", () => {
    expect(authorize({}, STAFF)).toMatchObject({ ok: false, status: 401 });
  });

  it("403 below the required role, ok at or above it", () => {
    const staff = ctxFor({ ...admin, role: STAFF });
    expect(authorize(staff, DEVELOPER)).toMatchObject({ ok: false, status: 403 });
    expect(authorize(staff, STAFF)).toMatchObject({ ok: true });
    expect(authorize(ctxFor(), DEVELOPER)).toMatchObject({ ok: true, user: admin });
  });
});

describe("authorizeMachine", () => {
  it("stays open when no key is configured", () => {
    expect(authorizeMachine({}, "IVR_WRITEBACK_API_KEY")).toEqual({ ok: true });
  });

  it("requires the key once configured", () => {
    vi.stubEnv("IVR_WRITEBACK_API_KEY", "k-123");
    expect(authorizeMachine({}, "IVR_WRITEBACK_API_KEY")).toMatchObject({ ok: false, status: 401 });
    expect(authorizeMachine(contextFrom({ "X-Api-Key": "k-123" }), "IVR_WRITEBACK_API_KEY")).toEqual({ ok: true });
  });
});
