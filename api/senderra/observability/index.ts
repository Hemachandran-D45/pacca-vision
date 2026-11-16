import type { VercelRequest, VercelResponse } from "../../../server/vercel-types.js";
import { handleSenderra } from "../../../server/senderra/api.js";
import { contextFrom } from "../../../server/auth.js";

/**
 * Dedicated Vercel Serverless Function for GET /api/senderra/observability
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
  const result = await handleSenderra("GET", "/observability", url.searchParams, {}, contextFrom(req.headers));

  res.setHeader("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(result.headers ?? {})) res.setHeader(name, value);
  return res.status(result.status).json(result.body);
}
