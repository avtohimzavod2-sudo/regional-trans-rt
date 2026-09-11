import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// CARGO_CARRIER_CONTRACTOR must never: write ScoutCandidate/Driver/
// DeliveryExecutorProspect directly (each contragent owns its own model);
// write Partner/Shipment/BusinessProspect/TransportAsset directly (a
// prospect's claimed capabilities never get auto-promoted into a trusted
// Partner Registry fact); assign a cargo delivery, confirm cargo safety, or
// touch money (those stay CARGO_OPERATIONS' exclusive capabilities); message
// externally as Mira; write a ProspectHandoff row directly rather than
// through the shared createProspectHandoff/acceptProspectHandoff
// entrypoints; or send outreach outside the shared, safety-gated
// sendAcquisitionOutreach entrypoint. Static source-text scan — same pattern
// as delivery-executor-contractor/boundary.test.ts.
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
  "db.scoutCandidate.create",
  "db.scoutCandidate.update",
  "db.driver.create",
  "db.driver.update",
  "db.partner.create",
  "db.shipment.create",
  "db.businessProspect.create",
  "db.passenger.create",
  "db.tripRequest.create",
  "db.deliveryExecutorProspect.create",
  "db.deliveryExecutorProspect.update",
  "db.driveCrmEvent.create",
  "db.deliveryCrmEvent.create",
  "db.acquisitionOutreachEvent.create",
  "db.prospectHandoff.create",
  "db.prospectHandoff.update",
  "db.prospectHandoff.updateMany",
  "db.transportAsset",
  "db.rtBalance",
  "db.ledgerEntry",
];

const CARGO_CARRIER_CONTRACTOR_DIR = join(__dirname);

function cargoCarrierContractorSourceFiles(): string[] {
  return readdirSync(CARGO_CARRIER_CONTRACTOR_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(CARGO_CARRIER_CONTRACTOR_DIR, f));
}

describe("CARGO_CARRIER_CONTRACTOR never writes ScoutCandidate/Driver/Partner/Shipment/TransportAsset/ProspectHandoff directly, touches money, or messages as Mira", () => {
  const files = cargoCarrierContractorSourceFiles();

  it("finds at least one CARGO_CARRIER_CONTRACTOR source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const label = file.replace(CARGO_CARRIER_CONTRACTOR_DIR, "").replace(/^[/\\]/, "");

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

    it(`${label} does not directly write ScoutCandidate/Driver/Partner/Shipment/TransportAsset/ProspectHandoff or touch money`, () => {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_CALL_SUBSTRINGS) {
        expect(source.includes(forbidden), `${file} contains a forbidden direct write/read "${forbidden}" — writes must go through prospect.ts / sendAcquisitionOutreach / createProspectHandoff`).toBe(false);
      }
    });
  }
});
