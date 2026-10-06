import type { VercelRequest, VercelResponse } from "../server/vercel-types.js";
import { DEVELOPER, authorize, contextFrom } from "../server/auth.js";
import { handleSolutionsV2 } from "../server/solutionsV2Api.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST, PATCH, DELETE, OPTIONS");
    return res.status(204).end();
  }

  // Solutions (doc types) are Solution Developer and above; see ROUTE_POLICY.
  const auth = authorize(contextFrom(req.headers), DEVELOPER);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};

  const url = new URL(req.url || "/", "http://localhost");
  const result = await handleSolutionsV2(method, body, url.searchParams);
  res.setHeader("Cache-Control", "no-store");
  return res.status(result.status).json(result.body);
}
