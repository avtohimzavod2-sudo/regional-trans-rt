import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// RT OFFICE + Drive CRM spec PART 1/3 — static regression guard (mirrors
// src/lib/rt-office/boundary.test.ts's pattern). CRM Auto MUST NOT:
//   - own Mira CRM or send an external passenger/driver-facing message;
//   - replace RT OFFICE's demand<->supply resolution;
//   - orchestrate other RT agents (no other agent's orchestrator.ts import);
//   - calculate money;
// and must never write Driver/DriverOffer/Match/Trip directly — its only
// write surface is its own DriveCrmEvent model.
// No database involved — this is a source-text import + call-site scan.
const FORBIDDEN_IMPORTS: Record<string, string[]> = {
  "@/lib/messaging/whatsapp": ["sendWhatsAppText", "sendWhatsAppConfirmButtons"],
  "@/lib/messaging/telegram": ["sendTelegramMessage"],
  "@/lib/mira/session": ["getOrCreateActiveConversation", "appendUserMessage", "appendMiraMessage", "updateConversationState"],
  "@/lib/agents/pay": ["chargeCommissionForTrip"],
  "@/lib/sapargul/payment": ["createPaymentRequest", "issuePaymentInstructions", "requestShipmentPayment", "submitPaymentEvidence"],
  "@/lib/sapargul/treasury": ["confirmActualPaymentReceipt", "rejectPayment", "markPaymentMismatch"],
  "@/lib/tyyin/ingestion": ["ingestBankTransaction", "runReconciliationForTransaction", "reconcileAllPending"],
  "@/lib/matching/orchestrate": ["proposeMatchesForRequest", "proposeMatchesForOffer", "handleDriverResponse", "handlePassengerResponse", "revealContacts", "completeTrip"],
  "@/lib/agents/match": ["matchRequest", "matchOffer"],
};

// CRM Auto must never write Driver/DriverOffer/Match/Trip/TripRequest
// directly — its only write surface is DriveCrmEvent (its own model).
const FORBIDDEN_CALL_SUBSTRINGS = [
  "db.driver.update",
  "db.driver.create",
  "db.driver.delete",
  "db.driverOffer.update",
  "db.driverOffer.create",
  "db.driverOffer.delete",
  "db.match.create",
  "db.match.update",
  "db.match.delete",
  "db.trip.create",
  "db.trip.update",
  "db.trip.delete",
  "db.tripRequest.update",
  "db.tripRequest.create",
  // Preserve full historical auditability: even CRM Auto's own model is
  // append-only. A mistaken fact is never fixed by mutating/removing the
  // original row — only by appending a new CORRECTION event that
  // references it via correctsEventId (see recordExceptionalCorrection).
  "db.driveCrmEvent.update",
  "db.driveCrmEvent.delete",
  "db.driveCrmEvent.upsert",
];

const CRM_AUTO_DIR = join(__dirname);

function crmAutoSourceFiles(): string[] {
  return readdirSync(CRM_AUTO_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(CRM_AUTO_DIR, f));
}

describe("CRM Auto never messages externally, orchestrates other agents, or writes Driver/DriverOffer/Match/Trip directly (spec PART 1/3)", () => {
  const files = crmAutoSourceFiles();

  it("finds at least one CRM Auto source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const label = file.replace(CRM_AUTO_DIR, "").replace(/^[/\\]/, "");

    it(`${label} does not import a forbidden external-comms/payment/orchestration function`, () => {
      const source = readFileSync(file, "utf8");
      const importStatements = source.match(/import\s+\{[^}]*\}\s+from\s+["'][^"']+["']/g) ?? [];

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

    it(`${label} does not directly write Driver/DriverOffer/Match/Trip/TripRequest`, () => {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_CALL_SUBSTRINGS) {
        expect(source.includes(forbidden), `${file} contains a forbidden direct write "${forbidden}" — CRM Auto's only write surface is DriveCrmEvent`).toBe(false);
      }
    });
  }
});
