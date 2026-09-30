import type { VercelRequest, VercelResponse } from "../../../server/vercel-types.js";
import { handleSenderra } from "../../../server/senderra/api.js";

/**
 * Dedicated Vercel Serverless Function for POST /api/senderra/observability/diagnose
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method || "POST").toUpperCase();

  if (method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (method !== "POST") {
    return res.status(405).json({ ok: false, error: `${method} not allowed.` });
  }

  const url = new URL(req.url || "/", "http://localhost");
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

  const result = await handleSenderra("POST", "/observability/diagnose", url.searchParams, body);

  res.setHeader("Cache-Control", "no-store");
  return res.status(result.status).json(result.body);
}
