import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// prospecting is a shared vocabulary/contract layer (ProspectType,
// ProspectHandoff, reserved event names) plus its own additive persistence
// (ProspectHandoff — handoff.ts) on top of the existing src/lib/acquisition/
// safety-gate infrastructure. It owns the `db.prospectHandoff.*` table only:
// it must never re-implement the outreach safety gate (sendAcquisitionOutreach
// / recordOptOut / writeOutreachEvent stay outreach-log.ts's exclusive job —
// handoff.ts may only *read* isDoNotContact, per spec s.4), and it must never
// reach into another domain's write surface (Partner/Driver/Passenger/
// TripRequest/Shipment/ScoutCandidate, or another CRM's orchestration).
// Same static source-text scan pattern as cargo-profile/boundary.test.ts.
const FORBIDDEN_IMPORTS: Record<string, string[]> = {
  "@/lib/acquisition/outreach-log": ["sendAcquisitionOutreach", "recordOptOut", "writeOutreachEvent"],
  "@/lib/sapar/executors": ["assignExecutor", "recordExecutorResponse"],
  "@/lib/delivery-contractor/orchestrator": [
    "processBusinessMarketSighting",
    "qualifyBusinessProspect",
    "agreeBusinessPartnership",
    "recordInboundBusinessProspect",
    "handoffBusinessToOperations",
  ],
};

const FORBIDDEN_CALL_SUBSTRINGS = [
  "db.partner.create",
  "db.driver.create",
  "db.passenger.create",
  "db.tripRequest.create",
  "db.shipment.create",
  "db.scoutCandidate.create",
  "db.acquisitionOutreachEvent.create",
  "prisma.",
];

const PROSPECTING_DIR = join(__dirname);

function prospectingSourceFiles(): string[] {
  return readdirSync(PROSPECTING_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(PROSPECTING_DIR, f));
}

describe("prospecting stays a dependency-free contract layer — no db access, no reimplementing the acquisition safety gate", () => {
  const files = prospectingSourceFiles();

  it("finds at least one prospecting source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const label = file.replace(PROSPECTING_DIR, "").replace(/^[/\\]/, "");

    it(`${label} does not import a forbidden db/outreach/orchestration function`, () => {
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
