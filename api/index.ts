import type { VercelRequest, VercelResponse } from "../server/vercel-types.js";
import { DEVELOPER, authorize, contextFrom } from "../server/auth.js";
import { createSolution } from "../server/solutionsApi.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Same-origin only: the wildcard CORS headers that used to be here let any
  // site call this route. Solution Developer and above, as in ROUTE_POLICY.
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  const auth = authorize(contextFrom(req.headers), DEVELOPER);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (req.method === "POST" && (pathname === "/api/solutions" || pathname === "/solutions")) {
    const result = await createSolution(req.body);
    return res.status(result.status).json(result.body);
  }

  return res.status(404).json({ message: "Not found" });
}
