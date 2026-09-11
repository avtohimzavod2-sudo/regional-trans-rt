import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// PASSENGER_CONTRACTOR must never: write Passenger/TripRequest directly
// (RT Core's exclusive write surface); message externally as Mira; write
// DriveCrmEvent, ScoutCandidate, or money; or send outreach outside the
// shared, safety-gated sendAcquisitionOutreach entrypoint. Static
// source-text scan — same pattern as crm-auto/boundary.test.ts.
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
  "@/lib/agents/scout": ["importScoutCandidate", "reviewScoutCandidate", "refreshDriverRepeatScore"],
  "@/lib/acquisition/adapters": ["telegramOutreachAdapter", "whatsappOutreachAdapter", "ADAPTERS_BY_CHANNEL"],
};

const FORBIDDEN_CALL_SUBSTRINGS = [
  "db.passenger.create",
  "db.passenger.update",
  "db.passenger.delete",
  "db.tripRequest.create",
  "db.tripRequest.update",
  "db.tripRequest.delete",
  "db.scoutCandidate.create",
  "db.driveCrmEvent.create",
  "db.acquisitionOutreachEvent.create",
  "db.prospectHandoff.create",
  "db.prospectHandoff.update",
  "db.prospectHandoff.updateMany",
  "db.rtBalance",
  "db.ledgerEntry",
];

const PASSENGER_CONTRACTOR_DIR = join(__dirname);

function passengerContractorSourceFiles(): string[] {
  return readdirSync(PASSENGER_CONTRACTOR_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(PASSENGER_CONTRACTOR_DIR, f));
}

describe("PASSENGER_CONTRACTOR never writes Passenger/TripRequest/ScoutCandidate directly, messages as Mira, or bypasses the shared outreach gate", () => {
  const files = passengerContractorSourceFiles();

  it("finds at least one PASSENGER_CONTRACTOR source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const label = file.replace(PASSENGER_CONTRACTOR_DIR, "").replace(/^[/\\]/, "");

    it(`${label} does not import a forbidden external-comms/payment/orchestration/scout/adapter function`, () => {
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

    it(`${label} does not directly write Passenger/TripRequest/ScoutCandidate/DriveCrmEvent/AcquisitionOutreachEvent or touch money`, () => {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_CALL_SUBSTRINGS) {
        expect(source.includes(forbidden), `${file} contains a forbidden direct write/read "${forbidden}"`).toBe(false);
      }
    });
  }
});
