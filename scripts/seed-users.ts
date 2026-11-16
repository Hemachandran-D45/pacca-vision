/**
 * Create (or reset) the three demo sign-in accounts, one per role.
 *
 *   SEED_PASSWORD='…' pnpm seed:users
 *
 * Reads COSMOS_* (and the other server settings) from .env.local like the dev
 * server does, and writes to the Cosmos `users` container. Re-running resets
 * the password and clears any lockout; it never deletes an account.
 *
 * The password comes from the environment, never from this file, so it is not
 * in the repository. Only its scrypt hash is stored.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "../server/loadLocalEnv.js";
import { ADMIN, DEVELOPER, STAFF, type Role } from "../server/auth.js";
import { usersContainer } from "../server/senderra/cosmos.js";
import { upsertUser } from "../server/senderra/users.js";

const ACCOUNTS: { email: string; name: string; role: Role }[] = [
  { email: "pacca.staff@emids.com", name: "PACCA Staff", role: STAFF },
  { email: "pacca.developer@emids.com", name: "PACCA Developer", role: DEVELOPER },
  { email: "pacca.admin@emids.com", name: "PACCA Admin", role: ADMIN },
];

async function main() {
  loadLocalEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

  const password = process.env.SEED_PASSWORD || "";
  if (password.length < 8) {
    console.error("Set SEED_PASSWORD (8+ characters), e.g.  SEED_PASSWORD='…' pnpm seed:users");
    process.exit(1);
  }

  const container = await usersContainer();
  if ("error" in container) {
    console.error(`Cosmos is not configured: ${container.error} ${container.missing.join(", ")}`);
    process.exit(1);
  }

  for (const account of ACCOUNTS) {
    await upsertUser(container, { ...account, password });
    console.log(`  ${account.role.padEnd(26)} ${account.email}`);
  }
  console.log(`Seeded ${ACCOUNTS.length} accounts into ${process.env.COSMOS_USERS_CONTAINER || "users"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
