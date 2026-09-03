import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleSenderra } from "../../server/senderra/api";

/**
 * Vercel catch-all for `/api/senderra/*`.
 *
 * One function rather than six: Vercel bills and cold-starts per function, and
 * Hobby projects cap at twelve. The routing itself lives in
 * `server/senderra/api.ts`, which the Vite dev server mounts as middleware, so
 * dev and production cannot diverge.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(204).end();
  }
  if (method !== "GET" && method !== "POST") {
    return res.status(405).json({ ok: false, error: `${method} not allowed.` });
  }

  const url = new URL(req.url || "/", "http://localhost");
  const route = url.pathname.replace(/^\/api\/senderra/, "") || "/";

  // Vercel parses a JSON body for us, but only when the content-type says so.
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

  const result = await handleSenderra(method, route, url.searchParams, body);

  // Every response here is per-request live state — a cached document list is
  // worse than a slow one, because it shows a document as Queued after it has
  // finished.
  res.setHeader("Cache-Control", "no-store");
  return res.status(result.status).json(result.body);
}
