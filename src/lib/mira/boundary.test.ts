import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Mira Pass 1 spec s.18/s.20/s.21/s.22 — static regression guard (mirrors
// src/lib/artur/boundary.test.ts's pattern). Mira is a conversational front
// door, not a cashier and not a dispute arbitrator:
//   - she must never mutate Sapargul/Tyyin financial records directly
//     (s.18/s.20) — passenger money flows through passenger-finance.ts's
//     typed intent instead, for a future cashier to process;
//   - she may open an Adilet case (the documented intake bridge — see
//     openCase's caller in orchestrator.ts and clientFacingSummary in
//     adilet/bridge.ts) but must never decide, sanction, appeal, or close
//     one herself (s.21) — Adilet remains the independent arbitrator;
//   - she must never import from an "Akjol" module (s.22 — out of scope for
//     this pass; no such module exists in this repo yet, and this test
//     keeps it that way for Mira specifically).
// No database involved — this is a source-text import scan, not a runtime check.
const FORBIDDEN_IMPORTS: Record<string, string[]> = {
  "@/lib/sapargul/payment": ["createPaymentRequest", "issuePaymentInstructions", "requestShipmentPayment", "submitPaymentEvidence"],
  "@/lib/sapargul/payment-lifecycle": ["transitionShipmentPayment"],
  "@/lib/sapargul/treasury": ["confirmActualPaymentReceipt", "rejectPayment", "markPaymentMismatch"],
  "@/lib/tyyin/ingestion": ["ingestBankTransaction", "runReconciliationForTransaction", "reconcileAllPending"],
  "@/lib/tyyin/accountant": ["openAccountantCase", "recordAccountantResolution", "closeAccountantCase"],
  "@/lib/adilet/decision": ["recordDecision", "escalateToDirector"],
  "@/lib/adilet/enforcement": ["applySanction", "reverseSanction", "expireDueSanctions"],
  "@/lib/adilet/appeal": ["requestAppeal", "resolveAppeal"],
  // openCase is intentionally NOT forbidden here — it is Mira's documented
  // Adilet intake bridge (spec s.21). attachEvidence/moveCaseToUnderReview/
  // closeCase are still off-limits: those belong to Adilet's own
  // investigation workflow, not to Mira's one-shot intake.
  "@/lib/adilet/case": ["attachEvidence", "moveCaseToUnderReview", "closeCase"],
};

// Any named import at all from an "Akjol" module is forbidden for Mira —
// unlike the finance/Adilet cases above, there is no partial allowance.
const FORBIDDEN_MODULE_PREFIXES = ["@/lib/akjol"];

const MIRA_DIR = join(__dirname);

function miraSourceFiles(): string[] {
  return readdirSync(MIRA_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(MIRA_DIR, f));
}

describe("Mira never imports a financial-mutation or Adilet-arbitration function directly (spec s.18/s.20/s.21)", () => {
  const files = miraSourceFiles();

  it("finds at least one Mira source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file.replace(MIRA_DIR, "").replace(/^[/\\]/, "")} does not import forbidden mutation/arbitration functions`, () => {
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

    it(`${file.replace(MIRA_DIR, "").replace(/^[/\\]/, "")} does not import from any Akjol module (spec s.22 — out of scope this pass)`, () => {
      const source = readFileSync(file, "utf8");
      const importStatements = source.match(/import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["'][^"']+["']/g) ?? [];

      for (const statement of importStatements) {
        const moduleMatch = statement.match(/from\s+["']([^"']+)["']/);
        const sourceModule = moduleMatch?.[1];
        if (!sourceModule) continue;

        for (const forbiddenPrefix of FORBIDDEN_MODULE_PREFIXES) {
          expect(sourceModule.startsWith(forbiddenPrefix), `${file} imports from forbidden module "${sourceModule}"`).toBe(false);
        }
      }
    });
  }
});
