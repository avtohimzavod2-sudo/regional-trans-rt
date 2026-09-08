import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// RT OFFICE + Drive CRM spec s.4 — static regression guard (mirrors
// src/lib/mira/boundary.test.ts's pattern). RT OFFICE MUST NOT:
//   - act as Mira / communicate externally as a second public persona
//     (Mira's exclusive external_customer_communication capability);
//   - own passenger CRM data or modify a TripRequest inside Mira CRM;
//   - execute payments;
//   - invent seats/availability/trip/breakdown status by writing directly
//     to DriverOffer/Match/Trip instead of going through RT Core's existing
//     matching/orchestrate.ts (spec s.5: reuse the current matching stack,
//     never a second matching engine).
// No database involved — this is a source-text import + call-site scan,
// not a runtime check.
const FORBIDDEN_IMPORTS: Record<string, string[]> = {
  "@/lib/messaging/whatsapp": ["sendWhatsAppText", "sendWhatsAppConfirmButtons"],
  "@/lib/messaging/telegram": ["sendTelegramMessage"],
  "@/lib/mira/session": ["getOrCreateActiveConversation", "appendUserMessage", "appendMiraMessage", "updateConversationState"],
  "@/lib/agents/pay": ["chargeCommissionForTrip"],
  "@/lib/sapargul/payment": ["createPaymentRequest", "issuePaymentInstructions", "requestShipmentPayment", "submitPaymentEvidence"],
  "@/lib/sapargul/treasury": ["confirmActualPaymentReceipt", "rejectPayment", "markPaymentMismatch"],
  "@/lib/tyyin/ingestion": ["ingestBankTransaction", "runReconciliationForTransaction", "reconcileAllPending"],
};

// RT OFFICE must never write DriverOffer/Match/Trip directly — every
// mutation must flow through matching/orchestrate.ts (or its agents/match.ts
// wrapper) so there is exactly one write path onto those tables.
const FORBIDDEN_CALL_SUBSTRINGS = [
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
];

const RT_OFFICE_DIR = join(__dirname);

function rtOfficeSourceFiles(): string[] {
  return readdirSync(RT_OFFICE_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(RT_OFFICE_DIR, f));
}

describe("RT OFFICE never messages externally, mutates payments, or writes DriverOffer/Match/Trip directly (spec s.4/s.5)", () => {
  const files = rtOfficeSourceFiles();

  it("finds at least one RT OFFICE source file to scan (sanity check on the scan itself)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const label = file.replace(RT_OFFICE_DIR, "").replace(/^[/\\]/, "");

    it(`${label} does not import a forbidden external-comms/payment function`, () => {
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

    it(`${label} does not directly write DriverOffer/Match/Trip`, () => {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_CALL_SUBSTRINGS) {
        expect(source.includes(forbidden), `${file} contains a forbidden direct write "${forbidden}" — route mutations through matching/orchestrate.ts`).toBe(false);
      }
    });
  }
});
