import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Spec s.4/s.28: Artur (Director) observes, synthesizes, and recommends — it
// must never become "a universal execution agent" that bypasses the
// specialist agents by directly calling their mutation functions (e.g.
// confirming a payment itself instead of asking Sapargul/Tyyin to do it).
// Reading specialist report/query functions (buildXReport, getX, listX,
// isX/requireX role checks, etc.) is fine and already happens (see
// snapshot.ts importing buildTreasuryDailyReport). This is a static
// regression guard, not a runtime mock — no database involved.
const FORBIDDEN_IMPORTS: Record<string, string[]> = {
  "@/lib/sapargul/payment": ["createPaymentRequest", "issuePaymentInstructions", "requestShipmentPayment", "submitPaymentEvidence"],
  "@/lib/sapargul/payment-lifecycle": ["transitionShipmentPayment"],
  "@/lib/sapargul/treasury": ["confirmActualPaymentReceipt", "rejectPayment", "markPaymentMismatch"],
  "@/lib/tyyin/ingestion": ["ingestBankTransaction", "runReconciliationForTransaction", "reconcileAllPending"],
  "@/lib/tyyin/accountant": ["openAccountantCase", "recordAccountantResolution", "closeAccountantCase"],
  "@/lib/adilet/enforcement": ["applySanction", "reverseSanction", "expireDueSanctions"],
  "@/lib/adilet/decision": ["recordDecision", "escalateToDirector"],
  "@/lib/adilet/case": ["openCase", "attachEvidence", "moveCaseToUnderReview", "closeCase"],
  "@/lib/adilet/appeal": ["requestAppeal", "resolveAppeal"],
};

const ARTUR_DIR = join(__dirname);

function arturSourceFiles(): string[] {
  return readdirSync(ARTUR_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(ARTUR_DIR, f));
}

describe("Artur never imports a specialist mutation function directly (spec s.4/s.28)", () => {
  const files = arturSourceFiles();

  it("finds at least one Artur source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file.replace(ARTUR_DIR, "").replace(/^[/\\]/, "")} does not import forbidden specialist mutation functions`, () => {
      const source = readFileSync(file, "utf8");
      const importStatements = source.match(/import\s+\{[^}]*\}\s+from\s+["'][^"']+["']/g) ?? [];

      for (const statement of importStatements) {
        const moduleMatch = statement.match(/from\s+["']([^"']+)["']/);
        const sourceModule = moduleMatch?.[1];
        if (!sourceModule || !(sourceModule in FORBIDDEN_IMPORTS)) continue;

        const namedImportsMatch = statement.match(/\{([^}]*)\}/);
        const namedImports = (namedImportsMatch?.[1] ?? "").split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim());

        for (const forbidden of FORBIDDEN_IMPORTS[sourceModule]) {
          expect(namedImports, `${file} imports forbidden mutation "${forbidden}" from "${sourceModule}"`).not.toContain(forbidden);
        }
      }
    });
  }
});
