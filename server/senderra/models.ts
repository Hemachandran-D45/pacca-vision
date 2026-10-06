/**
 * The model switch, proxied to the Function App.
 *
 *   GET  /api/senderra/models        -> FA GET /api/models         (Staff+)
 *   GET  /api/senderra/llm-settings  -> FA GET /api/settings/llm   (Staff+, history for Admin)
 *   POST /api/senderra/llm-settings  -> FA PUT /api/settings/llm   (Admin)
 *
 * The Function App owns the allowlist (models.json), the PHI guard, the
 * deployment ping and the audit trail; this module adds the two things only
 * this server knows: the function key, which must never reach the browser,
 * and WHO is asking. `updated_by` is always the signed-in email - the FA
 * cannot check it (its key authenticates this server, not the person), so a
 * value from the request body is never forwarded.
 *
 * POST, not PUT, on this side: the Vercel catch-all and both dev hosts only
 * route GET and POST.
 */
import type { SessionUser } from "../auth.js";
import { ADMIN, ROLE_RANK } from "../auth.js";
import { isConfigError, readConfig } from "./config.js";

type Result = { status: number; body: unknown };

const FA_TIMEOUT_MS = 20_000;

function fail(status: number, error: string): Result {
  return { status, body: { ok: false, error } };
}

async function callFunctionApp(path: string, init: RequestInit = {}, query: Record<string, string> = {}): Promise<Result> {
  const config = readConfig();
  if (isConfigError(config)) return fail(503, config.error);
  if (!config.functionUrl || !config.functionKey) {
    return fail(503, "Model switching needs SENDERRA_FUNCTION_URL and SENDERRA_FUNCTION_KEY on the server.");
  }

  const url = new URL(`/api/${path}`, config.functionUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  url.searchParams.set("code", config.functionKey);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(FA_TIMEOUT_MS),
    });
  } catch (error) {
    return fail(502, `Function App unreachable: ${String(error)}`);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return fail(502, `Function App answered ${response.status} with a non-JSON body.`);
  }

  if (!response.ok) {
    // FA errors look like {"error": "..."}; pass its status and message on so
    // the UI can show "not PHI-approved", "did not answer", "stale etag".
    return fail(response.status, String(body.error || `Function App error ${response.status}.`));
  }
  return { status: 200, body: { ok: true, ...body } };
}

export function handleModels(): Promise<Result> {
  return callFunctionApp("models");
}

export function handleLlmSettingsGet(user: SessionUser): Promise<Result> {
  // Who changed what, and why, is admin information; everyone else only needs
  // to know which model is active.
  const query: Record<string, string> = ROLE_RANK[user.role] >= ROLE_RANK[ADMIN] ? { history: "20" } : {};
  return callFunctionApp("settings/llm", {}, query);
}

const MODEL_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function handleLlmSettingsUpdate(user: SessionUser, body: Record<string, unknown>): Promise<Result> {
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!MODEL_ID.test(model)) return Promise.resolve(fail(400, "Choose a model."));

  const payload: Record<string, unknown> = {
    model,
    updated_by: user.email,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : "",
  };
  if (typeof body.reasoning_effort === "string" && body.reasoning_effort) payload.reasoning_effort = body.reasoning_effort;
  if (typeof body.etag === "string" && body.etag) payload.etag = body.etag;

  return callFunctionApp("settings/llm", { method: "PUT", body: JSON.stringify(payload) });
}
