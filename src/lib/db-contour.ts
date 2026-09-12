// Which database am I actually pointed at?
//
// RT's constraints forbid production DB mutations outright, and the constraint
// is only as good as the answer to that question. The trap is specific and
// this repo has it: `.env` points at the local Docker Postgres while
// `.env.local` points at the managed Neon database, and the two files are
// loaded by different tools with different precedence — Next.js prefers
// `.env.local`, the Prisma CLI reads `.env` and ignores `.env.local`. So the
// same `npm run` in the same directory can mean two different databases
// depending on which binary is in front, and nobody notices until a `migrate
// reset` lands somewhere it should never have reached.
//
// This module is the pure, testable half of the answer. It classifies a
// connection string and says whether destructive work (reset, drop, replay of
// the whole migration history) may proceed. scripts/assert-dev-database.ts is
// the enforcing half.
//
// Deliberate design decisions:
//
//   * UNKNOWN is not permission. A host this module does not recognize is
//     refused, not waved through (s.16, s.29 — UNKNOWN fails closed).
//   * There is no override env var. A flag that unlocks production is a flag
//     someone exports at 02:00 while debugging. Touching production requires
//     explicit Founder approval (s.31), which is a decision, not a variable.
//   * A "test-looking" database name does not launder a remote host. A
//     database called `neondb_test` on a managed provider is still a database
//     RT is not allowed to reset.

/** Where the connection string points. */
export type DatabaseContour =
  /** localhost/loopback — a developer's Docker container, or a CI service
   * container reached over the runner's loopback interface. Resettable. */
  | "LOCAL_DEVELOPMENT"
  /** A managed hosting provider. Never resettable by tooling in this repo. */
  | "MANAGED_REMOTE"
  /** Missing, unparseable, or a host that matches nothing known. */
  | "UNKNOWN";

export interface ContourVerdict {
  contour: DatabaseContour;
  /** Host as parsed, or null when the URL could not be read at all. */
  host: string | null;
  /** Database name as parsed, or null. */
  database: string | null;
  /** Human-readable justification, always populated. */
  reasons: string[];
  /** The only field callers should gate destructive operations on. */
  safeForDestructiveMigration: boolean;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** Hosting providers whose databases are, by construction, not ours to reset.
 * Matched as domain suffixes so regional and pooler subdomains are covered
 * (`ep-x-pooler.c-11.us-east-1.aws.neon.tech` matches `neon.tech`). */
const MANAGED_PROVIDER_SUFFIXES = [
  "neon.tech",
  "supabase.co",
  "supabase.com",
  "pooler.supabase.com",
  "rds.amazonaws.com",
  "redshift.amazonaws.com",
  "postgres.database.azure.com",
  "cloud.timescale.com",
  "cockroachlabs.cloud",
  "db.ondigitalocean.com",
  "render.com",
  "railway.app",
  "aivencloud.com",
  "vercel-storage.com",
  "prisma-data.net",
  "planetscale.com",
  "psdb.cloud",
  "upstash.io",
  "scalegrid.io",
  "elephantsql.com",
];

/** Parses just enough of a Postgres URL to classify it. Deliberately hand-rolled
 * rather than `new URL()` alone: passwords routinely contain characters that
 * make WHATWG URL parsing throw, and a throw here must not read as "no host
 * found, probably local". */
function parseTarget(url: string): { host: string | null; database: string | null } {
  const withoutScheme = url.replace(/^[a-z+]+:\/\//i, "");
  // Strip credentials at the last "@" — a password may itself contain "@".
  const authority = withoutScheme.slice(withoutScheme.lastIndexOf("@") + 1);
  const hostPort = authority.split(/[/?]/)[0] ?? "";
  const host = hostPort.replace(/:\d+$/, "").toLowerCase() || null;

  const pathMatch = authority.match(/\/([^/?]+)/);
  const database = pathMatch ? decodeURIComponent(pathMatch[1]) : null;

  return { host, database };
}

export function classifyDatabaseUrl(url: string | undefined | null): ContourVerdict {
  if (!url || url.trim() === "") {
    return {
      contour: "UNKNOWN",
      host: null,
      database: null,
      reasons: ["DATABASE_URL is unset or empty"],
      safeForDestructiveMigration: false,
    };
  }

  const { host, database } = parseTarget(url.trim());
  if (!host) {
    return {
      contour: "UNKNOWN",
      host: null,
      database,
      reasons: ["DATABASE_URL has no readable host"],
      safeForDestructiveMigration: false,
    };
  }

  const managed = MANAGED_PROVIDER_SUFFIXES.find((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (managed) {
    return {
      contour: "MANAGED_REMOTE",
      host,
      database,
      reasons: [
        `host "${host}" belongs to managed provider "${managed}"`,
        "a managed database is treated as production regardless of its name; resetting it requires explicit Founder approval (s.31)",
      ],
      safeForDestructiveMigration: false,
    };
  }

  if (LOOPBACK_HOSTS.has(host)) {
    return {
      contour: "LOCAL_DEVELOPMENT",
      host,
      database,
      reasons: [`host "${host}" is loopback — a local container or a CI service container`],
      safeForDestructiveMigration: true,
    };
  }

  return {
    contour: "UNKNOWN",
    host,
    database,
    reasons: [
      `host "${host}" is neither loopback nor a recognized managed provider`,
      "unrecognized is not the same as safe: refused so that a new hosting provider has to be classified deliberately rather than discovered by a reset",
    ],
    safeForDestructiveMigration: false,
  };
}

/** True only for a contour this repo's tooling may drop and rebuild. */
export function isResettableContour(url: string | undefined | null): boolean {
  return classifyDatabaseUrl(url).safeForDestructiveMigration;
}

/** Renders a verdict for a terminal, with the reasons, never the credentials. */
export function formatContourVerdict(verdict: ContourVerdict): string {
  const lines = [
    `contour:  ${verdict.contour}`,
    `host:     ${verdict.host ?? "(none)"}`,
    `database: ${verdict.database ?? "(none)"}`,
    `destructive operations: ${verdict.safeForDestructiveMigration ? "PERMITTED" : "REFUSED"}`,
  ];
  for (const reason of verdict.reasons) lines.push(`  - ${reason}`);
  return lines.join("\n");
}
