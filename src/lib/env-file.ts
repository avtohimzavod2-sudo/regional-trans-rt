// Minimal KEY=VALUE reader for `.env`-style files.
//
// Hand-rolled rather than pulling in dotenv, for one narrow reason: the only
// callers are the database contour guard and the integration-test config —
// the two places that decide whether a destructive command may run. Putting a
// third-party parser inside that decision buys nothing and widens what has to
// be trusted for RT never to reset the wrong database.
//
// It also stays deliberately dumb. No variable expansion, no multi-line values,
// no export-prefix handling: `.env` and `.env.example` in this repo use plain
// `KEY=value` and `KEY="value"`, and a parser that quietly handles more than
// the files contain is a parser that can disagree with the tool it is
// impersonating.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Reads `name` relative to `root`. A missing file is `{}`, not an error —
 * `.env.local` is optional and absent in CI. */
export function readEnvFile(name: string, root: string = process.cwd()): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(resolve(root, name), "utf8");
  } catch {
    return {};
  }

  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (key === "") continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    // First definition wins, matching how these files are read top-down and how
    // dotenv behaves. Silently preferring the last would mean a stray duplicate
    // at the bottom of the file changes the database.
    if (!(key in out)) out[key] = value;
  }
  return out;
}

/** The environment a Prisma CLI invocation would see: an already-exported
 * variable beats `.env`, and `.env.local` is not consulted at all — the Prisma
 * CLI does not read it, however much Next.js does. */
export function prismaCliEnv(root: string = process.cwd()): NodeJS.ProcessEnv {
  return { ...readEnvFile(".env", root), ...process.env };
}
