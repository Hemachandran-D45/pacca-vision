import path from "node:path";
import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts so a test run does not boot the dev-server
// plugins (and their Azure env loading).
export default defineConfig({
  // tsconfig says "jsx": "preserve" for Vite; tests compile JSX themselves.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    // The client flow tests render the app in a browser-like DOM.
    environmentMatchGlobs: [["tests/client/**", "jsdom"]],
    // Refuses any connection that is not loopback: tests never reach Azure,
    // OpenAI or the IVR backend, so a run costs nothing.
    setupFiles: ["tests/setup/no-network.ts", "tests/setup/stable-locale.ts"],
    testTimeout: 15_000,
  },
});
