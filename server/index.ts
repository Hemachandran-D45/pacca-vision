import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { loadLocalEnv } from "./loadLocalEnv.js";
import { createApp } from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  loadLocalEnv(path.resolve(__dirname, ".."));

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  const server = createServer(createApp(staticPath));

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // ACA sends SIGTERM when it replaces or scales in a replica. Stop accepting
  // connections and let in-flight requests finish, but never hang past the
  // platform's grace period.
  const shutdown = (signal: string) => {
    console.log(`${signal} received; closing server.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(console.error);
