// Vitest globalSetup for the integration project.
//
// Two steps, in this order, both against the target resolved (and contour-
// checked) by integration-db.ts:
//
//   1. `prisma migrate deploy` — build the schema by replaying the committed
//      migration history. Not `db push`: pushing the datamodel would test a
//      schema RT never deploys, and would have hidden the mistruncated index
//      name that only surfaced the first time these files were actually
//      executed against Postgres.
//
//   2. TRUNCATE every table. Data, not schema — the tables and the migration
//      history survive. This is what makes a run reproducible: no test can pass
//      because of a row the previous run left behind.
//
// Deliberately *not* `prisma migrate reset`. Dropping and rebuilding the whole
// schema on every run costs about a minute for this migration history and
// proves nothing extra: bootstrap-from-zero is already proven by CI, whose
// service container starts empty on every job. Keeping the destructive verb out
// of the default developer loop is worth more than the redundancy.
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { resolveIntegrationTarget } from "./integration-db";

export default async function setup(): Promise<void> {
  const target = resolveIntegrationTarget();

  // The URL itself is never logged — it carries a password. The source is,
  // because a failing CI run needs to say which database it rebuilt.
  console.log(`[integration] applying migrations (${target.source})`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_URL: target.url },
  });

  const prisma = new PrismaClient({ datasourceUrl: target.url });
  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    if (tables.length > 0) {
      // One statement, CASCADE, so foreign keys neither dictate an ordering nor
      // leave half the tables populated when one of them refuses.
      const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
    console.log(`[integration] truncated ${tables.length} tables`);
  } finally {
    await prisma.$disconnect();
  }
}
