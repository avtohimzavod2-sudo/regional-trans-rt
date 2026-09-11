import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// partner-registry is additive capability/transport-asset vocabulary layered
// on top of the existing Prisma `Partner` model (spec s.8) — it must never
// gain a database dependency or reach into an operational CRM's write
// surface. Same static source-text scan pattern as cargo-profile/boundary.test.ts.
const FORBIDDEN_IMPORTS: Record<string, string[]> = {
  "@/lib/db": ["db", "prisma"],
  "@/lib/sapar/executors": ["assignExecutor", "recordExecutorResponse"],
  "@/lib/delivery-contractor/orchestrator": [
    "processBusinessMarketSighting",
    "qualifyBusinessProspect",
    "agreeBusinessPartnership",
    "recordInboundBusinessProspect",
    "handoffBusinessToOperations",
  ],
  "@/lib/acquisition/outreach-log": ["sendAcquisitionOutreach", "recordOptOut", "writeOutreachEvent"],
};

const FORBIDDEN_CALL_SUBSTRINGS = ["db.partner.create", "db.partner.update", "db.partner.delete", "prisma."];

const PARTNER_REGISTRY_DIR = join(__dirname);

function partnerRegistrySourceFiles(): string[] {
  return readdirSync(PARTNER_REGISTRY_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(PARTNER_REGISTRY_DIR, f));
}

describe("partner-registry stays dependency-free capability vocabulary — no db access, no reach into Sapar/delivery-contractor/acquisition", () => {
  const files = partnerRegistrySourceFiles();

  it("finds at least one partner-registry source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const label = file.replace(PARTNER_REGISTRY_DIR, "").replace(/^[/\\]/, "");

    it(`${label} does not import a forbidden db/orchestration/outreach function`, () => {
      const source = readFileSync(file, "utf8");
      const importStatements = source.match(/import\s+(?:type\s+)?\{[^}]*\}\s+from\s+["'][^"']+["']/g) ?? [];

      for (const statement of importStatements) {
        const moduleMatch = statement.match(/from\s+["']([^"']+)["']/);
        const sourceModule = moduleMatch?.[1];
        if (!sourceModule || !(sourceModule in FORBIDDEN_IMPORTS)) continue;

        const namedImportsMatch = statement.match(/\{([^}]*)\}/);
        const namedImports = (namedImportsMatch?.[1] ?? "").split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim());

        for (const forbidden of FORBIDDEN_IMPORTS[sourceModule]) {
          expect(namedImports, `${file} imports forbidden function "${forbidden}" from "${sourceModule}"`).not.toContain(forbidden);
        }
      }
    });

    it(`${label} does not directly touch the database`, () => {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_CALL_SUBSTRINGS) {
        expect(source.includes(forbidden), `${file} contains a forbidden db access "${forbidden}"`).toBe(false);
      }
    });
  }
});
