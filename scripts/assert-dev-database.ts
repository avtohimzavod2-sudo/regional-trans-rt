// Gate in front of every destructive database command in package.json.
//
// Run as `npm run db:guard`, and chained ahead of db:migrate / db:reset /
// db:push / test:integration so that the dangerous command cannot start unless
// this one exits 0.
//
// It answers two questions:
//
//   1. Is the effective DATABASE_URL a contour RT is allowed to drop and
//      rebuild? (src/lib/db-contour.ts — UNKNOWN is refused, and there is no
//      override flag.)
//   2. Do `.env` and `.env.local` disagree about which database that is?
//      They do in this repo, and the tools disagree about which file wins:
//      Next.js prefers `.env.local`, the Prisma CLI reads `.env` and does not
//      load `.env.local` at all. A developer reading one file can be entirely
//      right about the contents and entirely wrong about the target.
//
// Exit codes: 0 permitted, 1 refused. Nothing here connects to a database —
// refusing to touch production must not itself require touching production.
import { resolve } from "node:path";
import { classifyDatabaseUrl, formatContourVerdict } from "../src/lib/db-contour";
import { readEnvFile } from "../src/lib/env-file";

const ROOT = resolve(import.meta.dirname, "..");

function main(): void {
  const fromProcess = process.env.DATABASE_URL;
  const dotEnv = readEnvFile(".env", ROOT);
  const dotEnvLocal = readEnvFile(".env.local", ROOT);

  // Precedence as the Prisma CLI sees it: an already-exported variable wins,
  // otherwise `.env`. This script guards Prisma commands, so it must judge the
  // URL Prisma will actually use — not the one the app would use.
  const effective = fromProcess ?? dotEnv.DATABASE_URL;
  const source = fromProcess ? "process environment" : dotEnv.DATABASE_URL ? ".env" : "(nothing)";

  console.log("RT database contour guard");
  console.log(`  effective DATABASE_URL source: ${source}`);
  console.log();

  const verdict = classifyDatabaseUrl(effective);
  console.log(formatContourVerdict(verdict));
  console.log();

  // Disagreement is reported whether or not the verdict permits the command:
  // the point is that someone reading the wrong file will misjudge the target.
  const localUrl = dotEnvLocal.DATABASE_URL;
  if (localUrl) {
    const localVerdict = classifyDatabaseUrl(localUrl);
    if (localVerdict.host !== verdict.host) {
      console.log("NOTE: .env and .env.local point at different databases.");
      console.log(`  Prisma CLI (this command) uses ${verdict.host ?? "(none)"} — from ${source}`);
      console.log(`  Next.js at runtime uses       ${localVerdict.host ?? "(none)"} — from .env.local (higher precedence)`);
      console.log(`  .env.local contour: ${localVerdict.contour}`);
      console.log("  This split is what keeps `prisma migrate` off the managed database. It is");
      console.log("  also exactly how someone ends up believing dev and runtime share a database.");
      console.log();
    }
  }

  if (!verdict.safeForDestructiveMigration) {
    console.error("REFUSED: this command may only run against a resettable development or test contour.");
    console.error("Start the local contour with `docker compose up -d` and point DATABASE_URL at it,");
    console.error("or, if this database genuinely must be migrated, that is a Founder decision (s.31)");
    console.error("and does not belong behind an environment variable.");
    process.exit(1);
  }

  console.log("PERMITTED: destructive database commands may proceed against this contour.");
}

main();
