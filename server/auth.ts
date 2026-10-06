/**
 * Sessions and roles for every server route.
 *
 * WHAT THIS REPLACES
 *
 * Login used to be a browser-only mock: the role lived in localStorage and the
 * API trusted anyone with the URL. Documents carry PHI, and the model switch
 * changes where PHI is sent, so identity has to be decided on the server.
 *
 * HOW IT WORKS
 *
 *   POST /api/senderra/login  {email, password}
 *     -> user read from Cosmos `users` (pk /username = lower-cased email)
 *     -> password checked against an scrypt hash
 *     -> HS256 JWT {sub, name, role, iat, exp} set as an httpOnly cookie
 *
 * Every later request carries the cookie automatically (same origin). The
 * browser never sees the token, so an injected script cannot steal it the way
 * it could read localStorage. SameSite=Strict keeps other sites from making
 * requests that carry it.
 *
 * Hiding a tab in the UI is presentation only. The guard that matters is
 * `authorize()` below, which every route goes through.
 *
 * No JWT or password library: node:crypto covers HS256 and scrypt, and the
 * fewer dependencies a serverless bundle traces, the fewer ways it can fail to
 * boot.
 */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export type Role = "Client Staff" | "PACCA Solution Developer" | "PACCA Platform Admin";

export const ROLES: Role[] = ["Client Staff", "PACCA Solution Developer", "PACCA Platform Admin"];

/** Higher includes lower: an admin can do everything a developer can. */
export const ROLE_RANK: Record<Role, number> = {
  "Client Staff": 1,
  "PACCA Solution Developer": 2,
  "PACCA Platform Admin": 3,
};

export const STAFF: Role = "Client Staff";
export const DEVELOPER: Role = "PACCA Solution Developer";
export const ADMIN: Role = "PACCA Platform Admin";

export type SessionUser = { email: string; name: string; role: Role };

export const SESSION_COOKIE = "pacca_session";
export const SESSION_TTL_SEC = 8 * 60 * 60;
export const EMAIL_DOMAIN = "@emids.com";

/** What every entry point (Vercel, Express, Vite) hands the dispatchers. */
export type RequestContext = {
  cookie?: string;
  headers?: Record<string, string | undefined>;
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

export function normaliseEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Only @emids.com accounts may exist or sign in. */
export function isAllowedEmail(email: string): boolean {
  return /^[a-z0-9._%+-]+@emids\.com$/.test(email);
}

// --- passwords -------------------------------------------------------------
// scrypt with N=2^14, r=8, p=1: ~16 MB and tens of ms per check — slow enough
// to make offline guessing expensive, fast enough for a serverless login.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );
}

/** `scrypt$N$r$p$<salt b64>$<hash b64>` — parameters travel with the hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), +n, +r, +p, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A hash of a random password, used so an unknown email costs the same time
 * as a wrong password and the response timing cannot enumerate accounts. */
let decoyHash: Promise<string> | null = null;
export function decoy(): Promise<string> {
  decoyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return decoyHash;
}

// --- tokens ------------------------------------------------------------------
const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** PACCA_JWT_SECRET, or null if it is missing or too short to be safe. */
export function jwtSecret(): string | null {
  const secret = process.env.PACCA_JWT_SECRET?.trim() || "";
  return secret.length >= 32 ? secret : null;
}

export function signSession(user: SessionUser, secret: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ sub: user.email, name: user.name, role: user.role, iat: nowSec, exp: nowSec + SESSION_TTL_SEC })
  );
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifySession(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): SessionUser | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    // The header is covered by the signature, but pin the algorithm anyway so a
    // token can never talk us into `none`.
    if (JSON.parse(Buffer.from(header, "base64url").toString()).alg !== "HS256") return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof claims.exp !== "number" || claims.exp <= nowSec) return null;
    if (!isAllowedEmail(normaliseEmail(claims.sub)) || !isRole(claims.role)) return null;
    return { email: claims.sub, name: String(claims.name || claims.sub), role: claims.role };
  } catch {
    return null;
  }
}

// --- cookies -----------------------------------------------------------------
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function currentUser(ctx: RequestContext | undefined): SessionUser | null {
  const secret = jwtSecret();
  if (!secret || !ctx?.cookie) return null;
  const token = parseCookies(ctx.cookie)[SESSION_COOKIE];
  return token ? verifySession(token, secret) : null;
}

// --- the guard -----------------------------------------------------------------
export type Authorized = { ok: true; user: SessionUser };
export type Denied = { ok: false; status: 401 | 403 | 503; error: string };

/** The signed-in user if they hold at least `min`, else why not. */
export function authorize(ctx: RequestContext | undefined, min: Role): Authorized | Denied {
  if (!jwtSecret()) {
    return { ok: false, status: 503, error: "Sign-in is not configured on the server (PACCA_JWT_SECRET, 32+ characters)." };
  }
  const user = currentUser(ctx);
  if (!user) return { ok: false, status: 401, error: "Sign in to continue." };
  if (ROLE_RANK[user.role] < ROLE_RANK[min]) {
    return { ok: false, status: 403, error: `This needs the ${min} role.` };
  }
  return { ok: true, user };
}

/** Machine-to-machine callers (the IVR writeback) present a shared key instead
 * of a session. With no key configured the route stays open, as it was, and
 * says so in the log — closing it without telling the IVR team would silently
 * break their callbacks. */
export function authorizeMachine(ctx: RequestContext | undefined, envName: string): { ok: true } | Denied {
  const expected = process.env[envName]?.trim();
  if (!expected) {
    console.warn(`${envName} is not set; machine route is unauthenticated.`);
    return { ok: true };
  }
  const given = ctx?.headers?.["x-api-key"] || "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Missing or wrong x-api-key." };
  }
  return { ok: true };
}

/** Header lookup that works for both Node's lower-cased map and arrays. */
export function contextFrom(headers: Record<string, string | string[] | undefined> | undefined): RequestContext {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    flat[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return { cookie: flat["cookie"], headers: flat };
}
