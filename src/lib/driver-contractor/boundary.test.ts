import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// DRIVER_CONTRACTOR must never: write ScoutCandidate/Driver directly (always
// through SCOUT's importScoutCandidate/reviewScoutCandidate); message
// externally as Mira; write DriveCrmEvent, money, or any other agent's
// exclusive model; or send outreach outside the shared, safety-gated
// sendAcquisitionOutreach entrypoint. Static source-text scan — same pattern
// as crm-auto/boundary.test.ts, no database involved.
const FORBIDDEN_IMPORTS: Record<string, string[]> = {
  "@/lib/messaging/whatsapp": ["sendWhatsAppText", "sendWhatsAppConfirmButtons"],
  "@/lib/messaging/telegram": ["sendTelegramMessage", "sendTelegramDirectMessage"],
  "@/lib/mira/session": ["getOrCreateActiveConversation", "appendUserMessage", "appendMiraMessage", "updateConversationState"],
  "@/lib/agents/pay": ["chargeCommissionForTrip"],
  "@/lib/sapargul/payment": ["createPaymentRequest", "issuePaymentInstructions", "requestShipmentPayment", "submitPaymentEvidence"],
  "@/lib/sapargul/treasury": ["confirmActualPaymentReceipt", "rejectPayment", "markPaymentMismatch"],
  "@/lib/tyyin/ingestion": ["ingestBankTransaction", "runReconciliationForTransaction", "reconcileAllPending"],
  "@/lib/crm-auto/orchestrator": ["recordOperationalEvent", "recordExceptionalCorrection", "openBreakdownIncident", "resolveBreakdownIncident"],
  "@/lib/matching/orchestrate": ["proposeMatchesForRequest", "proposeMatchesForOffer", "handleDriverResponse", "handlePassengerResponse", "revealContacts", "completeTrip"],
  "@/lib/acquisition/adapters": ["telegramOutreachAdapter", "whatsappOutreachAdapter", "ADAPTERS_BY_CHANNEL"],
};

const FORBIDDEN_CALL_SUBSTRINGS = [
  "db.scoutCandidate.create",
  "db.scoutCandidate.update",
  "db.scoutCandidate.delete",
  "db.driver.create",
  "db.driver.update",
  "db.driver.delete",
  "db.driveCrmEvent.create",
  "db.driveCrmEvent.update",
  "db.driveCrmEvent.delete",
  "db.acquisitionOutreachEvent.create",
  "db.rtBalance",
  "db.ledgerEntry",
];

const DRIVER_CONTRACTOR_DIR = join(__dirname);

function driverContractorSourceFiles(): string[] {
  return readdirSync(DRIVER_CONTRACTOR_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(DRIVER_CONTRACTOR_DIR, f));
}

describe("DRIVER_CONTRACTOR never writes ScoutCandidate/Driver directly, messages as Mira, or bypasses the shared outreach gate", () => {
  const files = driverContractorSourceFiles();

  it("finds at least one DRIVER_CONTRACTOR source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const label = file.replace(DRIVER_CONTRACTOR_DIR, "").replace(/^[/\\]/, "");

    it(`${label} does not import a forbidden external-comms/payment/orchestration/adapter function`, () => {
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

    it(`${label} does not directly write ScoutCandidate/Driver/DriveCrmEvent/AcquisitionOutreachEvent or touch money`, () => {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_CALL_SUBSTRINGS) {
        expect(source.includes(forbidden), `${file} contains a forbidden direct write/read "${forbidden}" — writes must go through SCOUT / sendAcquisitionOutreach`).toBe(false);
      }
    });
  }
});
