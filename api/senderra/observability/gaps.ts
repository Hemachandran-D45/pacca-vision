import type { VercelRequest, VercelResponse } from "../../../server/vercel-types.js";
import { handleSenderra } from "../../../server/senderra/api.js";

/**
 * Dedicated Vercel Serverless Function for GET /api/senderra/observability/gaps
 * Avoids Vercel router 404 issues on multi-segment [...route] endpoints.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(204).end();
  }
  if (method !== "GET") {
    return res.status(405).json({ ok: false, error: `${method} not allowed.` });
  }

  const url = new URL(req.url || "/", "http://localhost");
  const result = await handleSenderra("GET", "/observability/gaps", url.searchParams, {});

  res.setHeader("Cache-Control", "no-store");
  return res.status(result.status).json(result.body);
}
