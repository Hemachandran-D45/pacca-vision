import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { createSolution } from "./server/solutionsApi";
import { handleSenderra } from "./server/senderra/api";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/**
 * Injects the Umami analytics tag only when it is actually configured.
 *
 * It used to sit in `index.html` as a literal `%VITE_ANALYTICS_ENDPOINT%`
 * placeholder. Vite warns once per undefined placeholder on every dev start and
 * every build, and — because nothing ever set those vars — shipped a dead
 * `<script src="/umami">` to production. Injecting instead of substituting means
 * no warning when it is unset and no broken tag in the output.
 */
function vitePluginAnalytics(): Plugin {
  let endpoint = "";
  let websiteId = "";
  return {
    name: "pacca-analytics",
    configResolved(config) {
      endpoint = (config.env.VITE_ANALYTICS_ENDPOINT as string) || "";
      websiteId = (config.env.VITE_ANALYTICS_WEBSITE_ID as string) || "";
    },
    transformIndexHtml(html) {
      if (!endpoint || !websiteId) return html;
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              defer: true,
              src: `${endpoint.replace(/\/+$/, "")}/umami`,
              "data-website-id": websiteId,
            },
            injectTo: "body",
          },
        ],
      };
    },
  };
}

function vitePluginSolutionsApi(): Plugin {
  return {
    name: "pacca-solutions-api",
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, PROJECT_ROOT, "");
      for (const [key, value] of Object.entries(env)) {
        if (
          (key.startsWith("GITHUB_") ||
            key.startsWith("OPENAI_") ||
            key.startsWith("LLM_") ||
            key.startsWith("SOLUTION_")) &&
          process.env[key] === undefined
        ) {
          process.env[key] = value;
        }
      }

      server.middlewares.use("/api/solutions", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const send = async (payload: unknown) => {
          const result = await createSolution(payload);
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result.body));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          void send(reqBody).catch((error) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: String(error) }));
          });
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
          if (body.length > 300 * 1024) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Request body is too large." }));
            req.destroy();
          }
        });
        req.on("end", () => {
          if (res.writableEnded) return;
          try {
            const payload = body ? JSON.parse(body) : {};
            void send(payload).catch((error) => {
              if (res.writableEnded) return;
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: String(error) }));
            });
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Request body must be valid JSON." }));
          }
        });
      });
    },
  };
}

/**
 * Mounts the Senderra API on the dev server so `pnpm dev` behaves exactly like
 * the Vercel deployment. `api/senderra.ts` is the same dispatcher behind a
 * serverless handler — neither host owns the routing.
 */
function vitePluginSenderraApi(): Plugin {
  return {
    name: "pacca-senderra-api",
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, PROJECT_ROOT, "");
      for (const [key, value] of Object.entries(env)) {
        if (
          (key.startsWith("COSMOS_") ||
            key.startsWith("AZURE_STORAGE_") ||
            key.startsWith("SENDERRA_")) &&
          process.env[key] === undefined
        ) {
          process.env[key] = value;
        }
      }

      server.middlewares.use("/api/senderra", (req, res, next) => {
        const method = (req.method || "GET").toUpperCase();
        if (method !== "GET" && method !== "POST") return next();

        // Vite strips the mount prefix from req.url, so what is left is the
        // route plus its query string.
        const url = new URL(req.url || "/", "http://localhost");

        const send = async (body: Record<string, unknown>) => {
          const result = await handleSenderra(method, url.pathname, url.searchParams, body);
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result.body));
        };

        if (method === "GET") {
          void send({}).catch((error) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: String(error) }));
          });
          return;
        }

        let raw = "";
        req.on("data", (chunk) => {
          raw += chunk.toString();
          if (raw.length > 512 * 1024) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Request body is too large." }));
            req.destroy();
          }
        });
        req.on("end", () => {
          if (res.writableEnded) return;
          try {
            void send(raw ? JSON.parse(raw) : {}).catch((error) => {
              if (res.writableEnded) return;
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: String(error) }));
            });
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Request body must be valid JSON." }));
          }
        });
      });
    },
  };
}

function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/manus-storage", async (req, res) => {
        const key = req.url?.replace(/^\//, "");
        if (!key) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing storage key");
          return;
        }

        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

        if (!forgeBaseUrl || !forgeKey) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Storage proxy not configured");
          return;
        }

        try {
          const forgeUrl = new URL("v1/storage/presign/get", forgeBaseUrl + "/");
          forgeUrl.searchParams.set("path", key);

          const forgeResp = await fetch(forgeUrl, {
            headers: { Authorization: `Bearer ${forgeKey}` },
          });

          if (!forgeResp.ok) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Storage backend error");
            return;
          }

          const { url } = (await forgeResp.json()) as { url: string };
          if (!url) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Empty signed URL");
            return;
          }

          res.writeHead(307, { Location: url, "Cache-Control": "no-store" });
          res.end();
        } catch {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Storage proxy error");
        }
      });
    },
  };
}

/**
 * The Manus scaffold plugins are dev-only.
 *
 * `vitePluginManusRuntime` inlines ~366 KB into `index.html` — its own bundled
 * copy of the React runtime plus the Manus preview harness. Inline HTML cannot
 * be cached separately from the document, so on Vercel that is a third of a
 * megabyte re-downloaded on every single page load, to support a preview
 * integration that only exists inside Manus. `apply: "serve"` keeps it working
 * in local dev and keeps it out of the deployed bundle.
 */
const devOnly = (plugin: Plugin): Plugin => ({ ...plugin, apply: "serve" });

const plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  devOnly(vitePluginManusRuntime() as Plugin),
  vitePluginManusDebugCollector(),
  vitePluginAnalytics(),
  vitePluginSolutionsApi(),
  vitePluginSenderraApi(),
  vitePluginStorageProxy(),
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // No manualChunks. Splitting node_modules by hand broke the app: Vite's
    // CommonJS interop helpers are VIRTUAL modules whose id contains no
    // "node_modules", so a path-matching splitter leaves them in the entry
    // chunk while the vendor chunk that needs them executes first - React ends
    // up undefined and the page renders blank with
    // "Cannot read properties of undefined (reading 'createContext')".
    // The 500 kB advisory below is a real trade-off we accept, not a defect.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
