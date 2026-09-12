import { describe, expect, it } from "vitest";
import { deriveTestDatabaseUrl, resolveIntegrationTarget } from "./integration-db";

const LOCAL = "postgresql://postgres:postgres@localhost:55432/regional_trans_rt";

describe("deriveTestDatabaseUrl", () => {
  it("puts integration tests on a separate database from local development", () => {
    // The whole point: running the suite must not wipe the data a developer is
    // looking at in the dev database.
    expect(deriveTestDatabaseUrl(LOCAL)).toBe("postgresql://postgres:postgres@localhost:55432/regional_trans_rt_test");
  });

  it("keeps the query string where it belongs, after the database name", () => {
    expect(deriveTestDatabaseUrl("postgresql://u:p@localhost:5432/rt?schema=public&connect_timeout=5")).toBe(
      "postgresql://u:p@localhost:5432/rt_test?schema=public&connect_timeout=5",
    );
  });

  it("is idempotent, so a URL already pointing at the test database is left alone", () => {
    const already = "postgresql://u:p@localhost:5432/rt_test";
    expect(deriveTestDatabaseUrl(already)).toBe(already);
  });

  it("refuses to guess when the URL names no database", () => {
    // Falling back to the server's default database would mean truncating
    // whatever happens to live there.
    expect(() => deriveTestDatabaseUrl("postgresql://u:p@localhost:5432")).toThrow(/no database name/);
    expect(() => deriveTestDatabaseUrl("postgresql://u:p@localhost:5432/")).toThrow(/no database name/);
  });
});

describe("resolveIntegrationTarget", () => {
  it("derives the test database from DATABASE_URL", () => {
    const target = resolveIntegrationTarget({ DATABASE_URL: LOCAL });
    expect(target.source).toBe("derived from DATABASE_URL");
    expect(target.url).toContain("regional_trans_rt_test");
  });

  it("uses INTEGRATION_DATABASE_URL verbatim when set", () => {
    // CI's service database is called rt_integration; deriving
    // rt_integration_test would point at a database nobody created.
    const ci = "postgresql://postgres:postgres@127.0.0.1:5432/rt_integration";
    const target = resolveIntegrationTarget({ INTEGRATION_DATABASE_URL: ci, DATABASE_URL: LOCAL });
    expect(target.source).toBe("INTEGRATION_DATABASE_URL");
    expect(target.url).toBe(ci);
  });

  it("still refuses a managed database named by INTEGRATION_DATABASE_URL", () => {
    // An explicit variable states intent. It does not grant permission — these
    // tests truncate every table they find.
    expect(() =>
      resolveIntegrationTarget({
        INTEGRATION_DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/neondb",
      }),
    ).toThrow(/refuse to run/i);
  });

  it("refuses when the derived target is not a contour we may reset", () => {
    expect(() =>
      resolveIntegrationTarget({ DATABASE_URL: "postgresql://u:p@db.internal.example.com:5432/rt" }),
    ).toThrow(/refuse to run/i);
  });

  it("says plainly that no database is configured rather than inventing one", () => {
    expect(() => resolveIntegrationTarget({})).toThrow(/Neither INTEGRATION_DATABASE_URL nor DATABASE_URL/);
  });
});
