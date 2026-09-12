import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prismaCliEnv, readEnvFile } from "./env-file";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rt-env-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(name: string, contents: string): void {
  writeFileSync(join(root, name), contents, "utf8");
}

describe("readEnvFile", () => {
  it("reads plain and quoted values", () => {
    write(".env", 'A=one\nB="two"\nC=\'three\'\n');
    expect(readEnvFile(".env", root)).toEqual({ A: "one", B: "two", C: "three" });
  });

  it("ignores comments and blank lines", () => {
    write(".env", "# a comment\n\n  \nA=one\n   # indented comment\n");
    expect(readEnvFile(".env", root)).toEqual({ A: "one" });
  });

  it("keeps everything after the first = so a connection string survives intact", () => {
    // A password containing "=" is the case that breaks a naive split("=").
    write(".env", "DATABASE_URL=postgresql://u:pa=ss@localhost:55432/rt?schema=public\n");
    expect(readEnvFile(".env", root).DATABASE_URL).toBe("postgresql://u:pa=ss@localhost:55432/rt?schema=public");
  });

  it("lets the first definition win", () => {
    // A stray duplicate at the bottom of the file must not silently change the
    // database this repo's guard is about to approve.
    write(".env", "DATABASE_URL=postgresql://u:p@localhost:55432/first\nDATABASE_URL=postgresql://u:p@localhost:55432/second\n");
    expect(readEnvFile(".env", root).DATABASE_URL).toContain("/first");
  });

  it("treats a missing file as empty, not as an error", () => {
    // `.env.local` is absent in CI, and that is normal.
    expect(readEnvFile(".env.local", root)).toEqual({});
  });

  it("does not expand variables or handle export prefixes", () => {
    // Documented non-features: a parser that handles more than the files
    // contain can disagree with the tool it stands in for.
    write(".env", "A=one\nB=${A}/two\nexport C=three\n");
    const parsed = readEnvFile(".env", root);
    expect(parsed.B).toBe("${A}/two");
    expect(parsed["export C"]).toBe("three");
    expect(parsed.C).toBeUndefined();
  });
});

describe("prismaCliEnv", () => {
  it("lets an exported variable beat .env, as the Prisma CLI does", () => {
    write(".env", "RT_ENV_FILE_TEST=from-dotenv\n");
    process.env.RT_ENV_FILE_TEST = "from-process";
    try {
      expect(prismaCliEnv(root).RT_ENV_FILE_TEST).toBe("from-process");
    } finally {
      delete process.env.RT_ENV_FILE_TEST;
    }
  });

  it("does not consult .env.local, because the Prisma CLI does not", () => {
    // Next.js prefers .env.local. Prisma ignores it. Blurring that here would
    // make the contour guard describe a database Prisma is not about to touch.
    write(".env", "RT_ENV_FILE_TEST=from-dotenv\n");
    write(".env.local", "RT_ENV_FILE_TEST=from-dotenv-local\n");
    expect(prismaCliEnv(root).RT_ENV_FILE_TEST).toBe("from-dotenv");
  });
});
