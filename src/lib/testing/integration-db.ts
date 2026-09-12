// Where integration tests are allowed to run, and how they get a clean schema.
//
// Integration tests here are the real thing: a real Postgres, the real
// migration history, the real Prisma client, no mocked `@/lib/db`. That is the
// only way to prove a claim like "a duplicate financial intent is physically
// impossible" — a mocked client proves only that the mock agrees with the test.
//
// It also means these tests destroy a schema on every run, so the target has to
// be chosen defensively rather than inherited:
//
//   * never the database the app runs against (src/lib/db-contour.ts refuses
//     anything that is not loopback, with no override),
//   * never even the local *development* database, because a developer looking
//     at seeded dev data should not lose it by running the test suite. The
//     derived target is a separate `_test` database on the same server.
// Relative, not the "@/" alias the rest of src uses: vitest.integration.config.ts
// imports this module to decide the target before a Vite alias resolver exists,
// and an alias here fails config loading with a bare MODULE_NOT_FOUND.
import { classifyDatabaseUrl } from "../db-contour";
import { prismaCliEnv } from "../env-file";

/** Appends `_test` to the database name, preserving credentials, port and
 * query string. Deliberately string surgery rather than `new URL()`: Postgres
 * passwords routinely contain characters WHATWG URL parsing mangles, and this
 * value ends up as the destination of a schema drop. */
export function deriveTestDatabaseUrl(url: string): string {
  const queryAt = url.search(/[?#]/);
  const base = queryAt === -1 ? url : url.slice(0, queryAt);
  const query = queryAt === -1 ? "" : url.slice(queryAt);

  // Search past the scheme's own "//", or `postgresql://host:5432` reads as a
  // database called "host:5432" and the derived URL quietly renames the host
  // instead of the database.
  const schemeEnd = base.indexOf("://");
  const authorityStart = schemeEnd === -1 ? 0 : schemeEnd + 3;
  const slash = base.indexOf("/", authorityStart);

  // No path component means no database name to extend; refuse rather than
  // invent one, because "connect to the server's default database and drop its
  // schema" is the worst possible guess.
  if (slash === -1 || slash === base.length - 1) {
    throw new Error(`DATABASE_URL has no database name to derive a test database from: cannot run integration tests safely`);
  }

  const lastSlash = slash;
  const name = base.slice(lastSlash + 1);
  if (name.endsWith("_test")) return url;
  return `${base.slice(0, lastSlash + 1)}${name}_test${query}`;
}

export interface IntegrationTarget {
  url: string;
  /** Which input produced it — reported so a failing run says where to look. */
  source: "INTEGRATION_DATABASE_URL" | "derived from DATABASE_URL";
}

/** Resolves the database integration tests may reset, or throws.
 *
 * `INTEGRATION_DATABASE_URL` wins when set, and is used verbatim: CI's service
 * container has its own database name (`rt_integration`) and deriving
 * `rt_integration_test` would point at a database nobody created. It is still
 * put through the contour guard — an explicit variable is a statement of
 * intent, not an authorization. */
export type EnvLike = Record<string, string | undefined>;

export function resolveIntegrationTarget(env: EnvLike = prismaCliEnv()): IntegrationTarget {
  const explicit = env.INTEGRATION_DATABASE_URL?.trim();
  const target: IntegrationTarget = explicit
    ? { url: explicit, source: "INTEGRATION_DATABASE_URL" }
    : { url: deriveTestDatabaseUrl(requireDatabaseUrl(env)), source: "derived from DATABASE_URL" };

  const verdict = classifyDatabaseUrl(target.url);
  if (!verdict.safeForDestructiveMigration) {
    throw new Error(
      [
        `Integration tests refuse to run against this database (${target.source}).`,
        `  contour: ${verdict.contour}`,
        `  host:    ${verdict.host ?? "(none)"}`,
        ...verdict.reasons.map((r) => `  - ${r}`),
        "These tests drop and recreate a schema on every run. Start the local contour with",
        "`docker compose up -d`, or set INTEGRATION_DATABASE_URL to a throwaway database.",
      ].join("\n"),
    );
  }

  return target;
}

function requireDatabaseUrl(env: EnvLike): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Neither INTEGRATION_DATABASE_URL nor DATABASE_URL is set. Integration tests need a real database; " +
        "they are excluded from `npm test` precisely so that its absence is never silently tolerated.",
    );
  }
  return url;
}
