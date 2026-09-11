import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// DELIVERY_CONTRACTOR must never: write Partner or Shipment directly (those
// stay RT Core's / Sapar's exclusive write surfaces); confirm cargo payment
// (SAPARGUL's exclusive capability); message externally as Mira; mutate a
// DeliveryCrmEvent row once written; or send outreach outside the shared,
// safety-gated sendAcquisitionOutreach entrypoint. Static source-text scan —
// same pattern as crm-auto/boundary.test.ts.
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
  "db.partner.create",
  "db.partner.update",
  "db.partner.delete",
  "db.shipment.create",
  "db.shipment.update",
  "db.shipment.delete",
  "db.scoutCandidate.create",
  "db.driveCrmEvent.create",
  "db.acquisitionOutreachEvent.create",
  "db.prospectHandoff.create",
  "db.prospectHandoff.update",
  "db.prospectHandoff.updateMany",
  "db.rtBalance",
  "db.ledgerEntry",
  // Preserve full historical auditability: even this agent's own model is
  // append-only. A mistaken fact is never fixed by mutating/removing the
  // original row — only by appending a new CORRECTION event.
  "db.deliveryCrmEvent.update",
  "db.deliveryCrmEvent.delete",
  "db.deliveryCrmEvent.upsert",
];

const DELIVERY_CONTRACTOR_DIR = join(__dirname);

function deliveryContractorSourceFiles(): string[] {
  return readdirSync(DELIVERY_CONTRACTOR_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(DELIVERY_CONTRACTOR_DIR, f));
}

describe("DELIVERY_CONTRACTOR never writes Partner/Shipment directly, confirms payment, messages as Mira, or mutates its own append-only log", () => {
  const files = deliveryContractorSourceFiles();

  it("finds at least one DELIVERY_CONTRACTOR source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const label = file.replace(DELIVERY_CONTRACTOR_DIR, "").replace(/^[/\\]/, "");

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

    it(`${label} does not directly write Partner/Shipment/ScoutCandidate/DriveCrmEvent, mutate DeliveryCrmEvent, or touch money`, () => {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_CALL_SUBSTRINGS) {
        expect(source.includes(forbidden), `${file} contains a forbidden write/read "${forbidden}"`).toBe(false);
      }
    });
  }
});
