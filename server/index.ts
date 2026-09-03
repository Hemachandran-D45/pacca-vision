import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { loadLocalEnv } from "./loadLocalEnv.js";
import { createSolution } from "./solutionsApi.js";
import { handleSenderra } from "./senderra/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  loadLocalEnv(path.resolve(__dirname, ".."));

  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "256kb" }));
  app.post("/api/solutions", async (req, res) => {
    const result = await createSolution(req.body);
    res.status(result.status).json(result.body);
  });

  // Must be registered before the static handler and the SPA catch-all below,
  // which would otherwise answer /api/senderra/* with index.html.
  app.all(/^\/api\/senderra(\/.*)?$/, async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname.replace(/^\/api\/senderra/, "") || "/";
    const method = (req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      res.status(405).json({ ok: false, error: `${method} not allowed.` });
      return;
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const result = await handleSenderra(method, route, url.searchParams, body);
    res.setHeader("Cache-Control", "no-store");
    res.status(result.status).json(result.body);
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
