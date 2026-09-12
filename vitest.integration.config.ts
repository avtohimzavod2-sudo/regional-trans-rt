// Integration test project: real Postgres, real migrations, real Prisma client.
//
// Kept as a separate config rather than a tag inside the main suite so that
// `npm test` stays honest about what it proves. The unit suite mocks
// `@/lib/db` everywhere and must keep running with no database at all — in CI,
// on a fresh clone, offline. Mixing the two would mean either the unit suite
// silently requires Postgres, or the integration tests silently skip when it is
// missing, and a test that skips itself is a test that reports green for work
// it did not do.
import { defineConfig } from "vitest/config";
import path from "node:path";
import { resolveIntegrationTarget } from "./src/lib/testing/integration-db";

// Resolved at config load, so an unsafe target fails before a single test file
// is even collected. resolveIntegrationTarget throws on anything the contour
// guard refuses.
const target = resolveIntegrationTarget();

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["./src/lib/testing/integration-setup.ts"],
    // Every worker talks to the same schema. Parallel files would interleave
    // writes and turn a real ordering bug into an unreproducible flake — and a
    // flaky integration suite is worse than none, because it teaches people to
    // re-run until green. Concurrency that the tests are *about* (racing two
    // writers of the same idempotency key) is created explicitly inside a test
    // with Promise.all, where it is controlled and asserted on.
    fileParallelism: false,
    sequence: { concurrent: false },
    // A hung query against a real database looks identical to a slow one until
    // the run is cancelled 20 minutes later.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: target.url,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
