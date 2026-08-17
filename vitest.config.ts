import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Test configuration is deliberately SEPARATE from vite.config.ts.
 *
 * vite.config.ts sets `root: <repo>/client` because that is where index.html
 * lives for the browser build. Vitest inherits `root` when it falls back to the
 * Vite config, which silently scoped test discovery to client/ only — the
 * server/ and shared/ suites were never collected and therefore never ran.
 *
 * This config pins the root to the repository so the whole suite is discovered,
 * while re-declaring the `@` and `@shared` aliases that the source files import
 * through. It intentionally does NOT load the Vite plugin chain (React refresh,
 * Manus runtime, debug collector): those are dev-server concerns and are not
 * needed to execute these tests, which use renderToStaticMarkup rather than a
 * browser DOM.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    root: import.meta.dirname,
    environment: "node",
    include: [
      "client/**/*.{test,spec}.{ts,tsx}",
      "server/**/*.{test,spec}.{ts,tsx}",
      "shared/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.manus-logs/**"],
  },
});
