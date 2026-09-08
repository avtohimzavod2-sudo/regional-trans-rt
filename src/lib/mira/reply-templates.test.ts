import { describe, expect, it } from "vitest";
import { composeFallbackReply, composeFinanceAcknowledgement, composePartnerAcknowledgement, situationForOutcome } from "./reply-templates";
import type { CommandResult } from "@/lib/agents/command";

const OUTCOMES: CommandResult["outcome"][] = [
  "trip_request_created",
  "driver_offer_created",
  "cancellation_case_opened",
  "group_message_recorded",
  "group_message_skipped",
  "unrecognized",
];

describe("composeFallbackReply", () => {
  it("returns non-empty text for every outcome in every language", () => {
    for (const outcome of OUTCOMES) {
      for (const lang of ["KY", "RU", "EN"] as const) {
        const text = composeFallbackReply(outcome, lang);
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it("never mentions an internal agent name", () => {
    for (const outcome of OUTCOMES) {
      for (const lang of ["KY", "RU", "EN"] as const) {
        const text = composeFallbackReply(outcome, lang);
        expect(text).not.toMatch(/RT\s*COMMAND|MATCH\s*Agent|TRUST\s*Agent|PAY\s*Agent/i);
      }
    }
  });
});

describe("composeFinanceAcknowledgement / composePartnerAcknowledgement (Mira Pass 1 spec s.2/s.7/s.18)", () => {
  it("returns non-empty text in every language and never claims a payment action or promises RT OFFICE routing", () => {
    for (const lang of ["KY", "RU", "EN"] as const) {
      const finance = composeFinanceAcknowledgement(lang);
      const partner = composePartnerAcknowledgement(lang);
      expect(finance.length).toBeGreaterThan(0);
      expect(partner.length).toBeGreaterThan(0);
      expect(finance).not.toMatch(/RT\s*COMMAND|MATCH\s*Agent|TRUST\s*Agent|PAY\s*Agent|Tyyin|Sapargul/i);
      expect(partner).not.toMatch(/RT\s*COMMAND|MATCH\s*Agent|TRUST\s*Agent|PAY\s*Agent|RT\s*OFFICE/i);
    }
  });
});

describe("situationForOutcome", () => {
  it("returns a non-empty description for every outcome", () => {
    for (const outcome of OUTCOMES) {
      expect(situationForOutcome(outcome).length).toBeGreaterThan(0);
    }
  });
});
