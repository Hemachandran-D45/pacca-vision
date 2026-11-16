/**
 * Server configuration and signed-in callers for route tests.
 *
 * Every value is fake. The storage key only has to be valid base64, because
 * SAS minting is real HMAC over it.
 */
import { vi } from "vitest";
import { ADMIN, DEVELOPER, STAFF, contextFrom, sessionCookie, signSession, type Role } from "../../../server/auth.js";

export const SECRET = "t".repeat(40);
export const STORAGE_KEY = Buffer.from("fake-storage-key").toString("base64");
export const FUNCTION_URL = "https://func.test";
export const IVR_URL = "https://ivr.test/idp/trigger-outreach";

export const CONFIGURED: Record<string, string> = {
  PACCA_JWT_SECRET: SECRET,
  COSMOS_ENDPOINT: "https://cosmos.test:443/",
  COSMOS_KEY: "fake-cosmos-key",
  COSMOS_DATABASE: "senderra-idp",
  COSMOS_CONTAINER: "documents",
  AZURE_STORAGE_ACCOUNT: "fakeacct",
  AZURE_STORAGE_KEY: STORAGE_KEY,
  SENDERRA_DOCS_CONTAINER: "docs-in",
  SENDERRA_UPLOAD_RUN_ID: "ui",
  SENDERRA_FUNCTION_URL: "",
  SENDERRA_FUNCTION_KEY: "",
  PACCA_IVR_TRIGGER_ENABLED: "",
  IVR_TRIGGER_URL: "",
  IVR_API_KEY: "",
  IVR_WRITEBACK_API_KEY: "",
  COSMOS_USERS_CONTAINER: "",
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_DEPLOYMENT: "",
  OPENAI_MODEL: "",
  LLM_API_KEY: "",
  AZURE_FILES_SHARE_NAME: "",
  AZURE_CLIENT_ID: "",
  LOG_ANALYTICS_WORKSPACE_ID: "",
  GITHUB_TOKEN: "",
};

/**
 * A fully configured server, plus overrides. Every variable the server reads
 * is set (blank when off), so a developer's shell cannot leak into a test.
 */
export function configureEnv(overrides: Record<string, string> = {}) {
  for (const [name, value] of Object.entries({ ...CONFIGURED, ...overrides })) vi.stubEnv(name, value);
}

/** The Function App on, so `/models` and the observability proxy are reachable. */
export const WITH_FUNCTION_APP = { SENDERRA_FUNCTION_URL: FUNCTION_URL, SENDERRA_FUNCTION_KEY: "fake-fn-key" };

/** IVR outreach on. */
export const WITH_IVR = { PACCA_IVR_TRIGGER_ENABLED: "true", IVR_TRIGGER_URL: IVR_URL, IVR_API_KEY: "fake-ivr-key" };

export const EMAIL: Record<Role, string> = {
  [STAFF]: "pacca.staff@emids.com",
  [DEVELOPER]: "pacca.developer@emids.com",
  [ADMIN]: "pacca.admin@emids.com",
} as Record<Role, string>;

/** The request context of a signed-in user. */
export function as(role: Role) {
  const cookie = sessionCookie(signSession({ email: EMAIL[role], name: role, role }, SECRET)).split(";")[0];
  return contextFrom({ cookie });
}

export { ADMIN, DEVELOPER, STAFF };
