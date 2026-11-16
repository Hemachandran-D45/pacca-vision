import express, { type Request, type Response } from "express";
import path from "path";
import { createSolution } from "./solutionsApi.js";
import { handleSolutionsV2 } from "./solutionsV2Api.js";
import { handleSenderra } from "./senderra/api.js";
import { DEVELOPER, authorize, contextFrom } from "./auth.js";

/**
 * Express 4 does not catch a rejected async handler: the rejection goes
 * unhandled, and Node 22 exits on an unhandled rejection - taking every
 * in-flight request with it, not just the one that failed. Vercel isolates
 * each invocation, so only the long-running server (`pnpm start`, the
 * container) is exposed. Wrap every async route in this.
 */
export const safe =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => {
    handler(req, res).catch((error) => {
      console.error(`${req.method} ${req.path} failed:`, error);
      if (!res.headersSent) res.status(500).json({ ok: false, error: "Internal server error." });
    });
  };

/** The Express app without a listener, so tests can drive it in-process. */
export function createApp(staticPath: string) {
  const app = express();
  app.set("trust proxy", true);

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.blob.core.windows.net; frame-src 'self' https://*.blob.core.windows.net; frame-ancestors 'self';"
    );
    next();
  });

  app.use(express.json({ limit: "256kb" }));

  // Liveness/readiness probe for the container platform. Deliberately touches
  // no dependency: /api/senderra/health runs a Cosmos COUNT, which would cost
  // RUs on every probe and restart the app whenever Cosmos is slow.
  app.get("/healthz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  });
  // Solutions (doc types) are Solution Developer and above; see ROUTE_POLICY.
  app.use(["/api/solutions", "/api/solutions-v2"], (req, res, next) => {
    const auth = authorize(contextFrom(req.headers), DEVELOPER);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error });
      return;
    }
    next();
  });
  app.post("/api/solutions", safe(async (req, res) => {
    const result = await createSolution(req.body);
    res.status(result.status).json(result.body);
  }));
  app.all("/api/solutions-v2", safe(async (req, res) => {
    const method = (req.method || "GET").toUpperCase();
    const result = await handleSolutionsV2(method, req.body, new URL(req.url || "/", "http://localhost").searchParams);
    res.status(result.status).json(result.body);
  }));

  // Must be registered before the static handler and the SPA catch-all below,
  // which would otherwise answer /api/senderra/* with index.html.
  app.all(/^\/api\/senderra(\/.*)?$/, safe(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname.replace(/^\/api\/senderra/, "") || "/";
    const method = (req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      res.status(405).json({ ok: false, error: `${method} not allowed.` });
      return;
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const headers = req.ip ? { ...req.headers, "x-real-ip": req.ip } : req.headers;
    const result = await handleSenderra(method, route, url.searchParams, body, contextFrom(headers));
    res.setHeader("Cache-Control", "no-store");
    for (const [name, value] of Object.entries(result.headers ?? {})) res.setHeader(name, value);
    res.status(result.status).json(result.body);
  }));

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  return app;
}
