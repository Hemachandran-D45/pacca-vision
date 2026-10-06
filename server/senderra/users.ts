/**
 * Sign-in accounts, kept in the Cosmos `users` container (pk /username).
 *
 *   { id: email, username: email, name, role, passwordHash,
 *     disabled, failedLogins, lockedUntil, createdAt, updatedAt, lastLoginAt }
 *
 * id and username are the lower-cased email, so a sign-in is one 1 RU point
 * read. There is no sign-up route: accounts come from `pnpm seed:users`.
 *
 * Five wrong passwords in a row lock the account for fifteen minutes. That is
 * not a substitute for a real identity provider; it only stops an anonymous
 * script from guessing at the public URL indefinitely.
 */
import type { Container } from "@azure/cosmos";
import {
  decoy,
  hashPassword,
  isAllowedEmail,
  isRole,
  normaliseEmail,
  verifyPassword,
  type Role,
  type SessionUser,
} from "../auth.js";
import { usersContainer } from "./cosmos.js";

export type UserItem = {
  id: string;
  username: string;
  name: string;
  role: Role;
  passwordHash: string;
  disabled?: boolean;
  failedLogins?: number;
  lockedUntil?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
};

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

type LoginResult = { ok: true; user: SessionUser } | { ok: false; status: 400 | 401 | 423 | 503; error: string };

const INVALID = "Invalid email or password.";

async function readUser(container: Container, email: string): Promise<UserItem | null> {
  try {
    const { resource } = await container.item(email, email).read<UserItem>();
    return resource ?? null;
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    throw error;
  }
}

export async function login(emailRaw: unknown, password: unknown, now = new Date()): Promise<LoginResult> {
  const email = normaliseEmail(emailRaw);
  if (!isAllowedEmail(email)) return { ok: false, status: 400, error: "Use your @emids.com email address." };
  if (typeof password !== "string" || !password) return { ok: false, status: 400, error: "Enter your password." };

  const container = await usersContainer();
  if ("error" in container) return { ok: false, status: 503, error: container.error };

  const user = await readUser(container, email);
  if (!user || user.disabled || !isRole(user.role)) {
    await verifyPassword(password, await decoy());         // same cost as a real check
    return { ok: false, status: 401, error: INVALID };
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > now) {
    return { ok: false, status: 423, error: `Too many failed attempts. Try again after ${new Date(user.lockedUntil).toLocaleTimeString()}.` };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  const failed = valid ? 0 : (user.failedLogins || 0) + 1;
  const locked = failed >= MAX_FAILED_LOGINS
    ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000).toISOString()
    : null;

  // Best effort: a failed counter write must not turn a good password into an
  // error, nor a bad one into a success.
  try {
    await container.items.upsert<UserItem>({
      ...user,
      failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
      lockedUntil: locked,
      ...(valid ? { lastLoginAt: now.toISOString() } : {}),
    });
  } catch (error) {
    console.warn(`users: could not record login outcome for ${email}: ${String(error)}`);
  }

  if (!valid) return { ok: false, status: 401, error: INVALID };
  return { ok: true, user: { email, name: user.name || email, role: user.role } };
}

/** Create or replace an account. Used by the seed script; never by a route. */
export async function upsertUser(
  container: Container,
  input: { email: string; name: string; role: Role; password: string },
  now = new Date()
): Promise<UserItem> {
  const email = normaliseEmail(input.email);
  if (!isAllowedEmail(email)) throw new Error(`${input.email}: only @emids.com accounts are allowed.`);
  if (!isRole(input.role)) throw new Error(`${input.role}: unknown role.`);
  if (input.password.length < 8) throw new Error("Passwords must be at least 8 characters.");

  const existing = await readUser(container, email);
  const item: UserItem = {
    id: email,
    username: email,
    name: input.name,
    role: input.role,
    passwordHash: await hashPassword(input.password),
    disabled: false,
    failedLogins: 0,
    lockedUntil: null,
    createdAt: existing?.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    lastLoginAt: existing?.lastLoginAt ?? null,
  };
  await container.items.upsert(item);
  return item;
}
