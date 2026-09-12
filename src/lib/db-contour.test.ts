import { describe, expect, it } from "vitest";
import { classifyDatabaseUrl, formatContourVerdict, isResettableContour } from "./db-contour";

describe("classifyDatabaseUrl", () => {
  it("permits the local Docker contour this repo ships", () => {
    const verdict = classifyDatabaseUrl("postgresql://postgres:postgres@localhost:55432/regional_trans_rt");
    expect(verdict.contour).toBe("LOCAL_DEVELOPMENT");
    expect(verdict.host).toBe("localhost");
    expect(verdict.database).toBe("regional_trans_rt");
    expect(verdict.safeForDestructiveMigration).toBe(true);
  });

  it("permits a CI service container reached over loopback", () => {
    // GitHub Actions `services:` are published on the runner's loopback
    // interface, which is why the integration job needs no special case.
    expect(isResettableContour("postgresql://postgres:postgres@127.0.0.1:5432/rt_integration")).toBe(true);
    expect(isResettableContour("postgresql://u:p@[::1]:5432/rt_integration")).toBe(true);
  });

  it("refuses the managed Neon database, pooler host included", () => {
    const verdict = classifyDatabaseUrl(
      "postgresql://user:pw@ep-bold-dust-avgaec0n-pooler.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require",
    );
    expect(verdict.contour).toBe("MANAGED_REMOTE");
    expect(verdict.safeForDestructiveMigration).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("neon.tech");
  });

  it("refuses every managed provider suffix it knows, and says which one matched", () => {
    const hosts = [
      "db.abcdefgh.supabase.co",
      "rt.cluster-xyz.eu-central-1.rds.amazonaws.com",
      "rt-db.postgres.database.azure.com",
      "rt-8231.g8x.cockroachlabs.cloud",
      "rt-pg.aivencloud.com",
      "rt.railway.app",
    ];
    for (const host of hosts) {
      const verdict = classifyDatabaseUrl(`postgresql://u:p@${host}:5432/rt`);
      expect(verdict.contour, host).toBe("MANAGED_REMOTE");
      expect(verdict.safeForDestructiveMigration, host).toBe(false);
    }
  });

  it("does not let a test-looking database name launder a managed host", () => {
    // The name is the easiest thing in a connection string to be wrong about.
    const verdict = classifyDatabaseUrl("postgresql://u:p@ep-x.neon.tech/neondb_test_scratch");
    expect(verdict.contour).toBe("MANAGED_REMOTE");
    expect(verdict.safeForDestructiveMigration).toBe(false);
  });

  it("refuses an unrecognized remote host instead of assuming it is fine", () => {
    const verdict = classifyDatabaseUrl("postgresql://u:p@db.internal.example.com:5432/rt");
    expect(verdict.contour).toBe("UNKNOWN");
    expect(verdict.safeForDestructiveMigration).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("unrecognized is not the same as safe");
  });

  it("refuses a missing, empty or unreadable URL", () => {
    for (const url of [undefined, null, "", "   ", "not-a-url", "postgresql://"]) {
      const verdict = classifyDatabaseUrl(url);
      expect(verdict.contour, String(url)).toBe("UNKNOWN");
      expect(verdict.safeForDestructiveMigration, String(url)).toBe(false);
    }
  });

  it("finds the host even when the password contains an @ or a slash", () => {
    // A WHATWG URL parse throws or mis-splits on these, and a throw must never
    // be read as "no host, probably local".
    const verdict = classifyDatabaseUrl("postgresql://user:p@ss/w0rd@ep-x.neon.tech:5432/neondb");
    expect(verdict.host).toBe("ep-x.neon.tech");
    expect(verdict.contour).toBe("MANAGED_REMOTE");
  });

  it("is case-insensitive about the host", () => {
    expect(classifyDatabaseUrl("postgresql://u:p@EP-X.NEON.TECH/neondb").contour).toBe("MANAGED_REMOTE");
    expect(classifyDatabaseUrl("postgresql://u:p@LocalHost:55432/rt").contour).toBe("LOCAL_DEVELOPMENT");
  });

  it("does not match a provider name that merely appears inside a longer label", () => {
    // "notneon.tech" is a different domain from "neon.tech"; suffix matching
    // must be on a label boundary, not a substring.
    expect(classifyDatabaseUrl("postgresql://u:p@db.notneon.tech/rt").contour).toBe("UNKNOWN");
  });
});

describe("formatContourVerdict", () => {
  it("prints the verdict and reasons without echoing credentials", () => {
    const url = "postgresql://postgres:sup3rs3cret@localhost:55432/regional_trans_rt";
    const text = formatContourVerdict(classifyDatabaseUrl(url));
    expect(text).toContain("LOCAL_DEVELOPMENT");
    expect(text).toContain("PERMITTED");
    expect(text).not.toContain("sup3rs3cret");
  });

  it("says REFUSED for anything not resettable", () => {
    expect(formatContourVerdict(classifyDatabaseUrl("postgresql://u:p@ep-x.neon.tech/neondb"))).toContain("REFUSED");
  });
});
