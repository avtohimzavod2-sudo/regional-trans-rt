import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Integration tests need a real Postgres and live in their own project
    // (vitest.integration.config.ts). They match the include glob above, so
    // without this they would be pulled into `npm test` and fail on any machine
    // — or any CI job — that has no database. `npm test` must stay runnable
    // with nothing but a clone and node_modules.
    exclude: ["node_modules/**", "dist/**", ".next/**", "src/**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
