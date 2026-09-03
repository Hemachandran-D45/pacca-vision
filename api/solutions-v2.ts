import type { VercelRequest, VercelResponse } from "../server/vercel-types.js";
import { handleSolutionsV2 } from "../server/solutionsV2Api.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST, PATCH, DELETE, OPTIONS");
    return res.status(204).end();
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};

  const url = new URL(req.url || "/", "http://localhost");
  const result = await handleSolutionsV2(method, body, url.searchParams);
  res.setHeader("Cache-Control", "no-store");
  return res.status(result.status).json(result.body);
}
