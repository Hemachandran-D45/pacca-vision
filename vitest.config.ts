import { defineConfig } from "vitest/config";

// Server-side unit tests only. Kept apart from vite.config.ts so a test run
// does not boot the dev-server plugins (and their Azure env loading).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
