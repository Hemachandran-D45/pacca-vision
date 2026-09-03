import type { VercelRequest, VercelResponse } from "../server/vercel-types.js";
import { createSolution } from "../server/solutionsApi.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (req.method === "POST" && (pathname === "/api/solutions" || pathname === "/solutions")) {
    const result = await createSolution(req.body);
    return res.status(result.status).json(result.body);
  }

  return res.status(404).json({ message: "Not found" });
}
