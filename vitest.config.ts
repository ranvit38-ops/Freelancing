import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config. Mirrors the TS path aliases so tests can import app modules.
 * The more specific "@/site.config" alias must come before the general "@".
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: "@/site.config", replacement: path.resolve(__dirname, "site.config.ts") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
