import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Spec s.14 item T: onboarding Contragents #3/#4 must never grow a second
// matching engine, a second CRM, or a second Market Gap computation — every
// new contractor must call the one existing implementation, not reimplement
// its own copy. Static source-text scan across all of src/, same pattern as
// boundary.test.ts in this directory and in each contractor directory:
// each of these five cross-cutting engines must have exactly one `export
// function`/`export async function` definition anywhere in the codebase.
const SRC_DIR = join(__dirname, "..", "..");

function allSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))
    .map((f) => join(dir, f));
}

const SINGLETON_ENGINES: Record<string, RegExp> = {
  "computeMarketGap (RT OFFICE Market Gap — the only demand/supply gap computation)": /export\s+(?:async\s+)?function\s+computeMarketGap\b/,
  "proposeMatchesForRequest (the only trip-matching engine)": /export\s+(?:async\s+)?function\s+proposeMatchesForRequest\b/,
  "recordOperationalEvent (Drive/Delivery CRM — the only operational-event CRM writer)": /export\s+(?:async\s+)?function\s+recordOperationalEvent\b/,
  "sendAcquisitionOutreach (the only outreach safety gate)": /export\s+(?:async\s+)?function\s+sendAcquisitionOutreach\b/,
  "classifyMarketRole (the only market-sighting role classifier)": /export\s+(?:async\s+)?function\s+classifyMarketRole\b/,
  "createProspectHandoff (the only Prospecting Core handoff writer)": /export\s+(?:async\s+)?function\s+createProspectHandoff\b/,
};

describe("no second matching/CRM/Market-Gap/outreach/classifier/handoff engine exists anywhere in src/", () => {
  const files = allSourceFiles(SRC_DIR);

  it("finds a non-trivial number of source files to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const [label, pattern] of Object.entries(SINGLETON_ENGINES)) {
    it(`${label} is defined in exactly one file`, () => {
      const definingFiles = files.filter((file) => pattern.test(readFileSync(file, "utf8")));
      expect(definingFiles, `expected exactly one definition of ${label}, found: ${definingFiles.join(", ")}`).toHaveLength(1);
    });
  }
});
