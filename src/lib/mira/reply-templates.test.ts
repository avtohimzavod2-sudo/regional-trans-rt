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

// Mira Professional Communication Pass s.2 (Cancellation Semantic Safety).
// agents/support.ts's openSupportCase() sets Trip.status = CANCELLED
// synchronously, in the same call that creates the CANCELLATION SupportCase
// — by the time CommandResult.outcome is "cancellation_case_opened", the
// backend has already verified the cancellation, not merely opened a
// pending request. These tests pin that wording contract so it can't
// silently regress into a false completion claim (if verification is ever
// decoupled from case-opening) or an unnecessarily hedgy pending claim
// (while it stays coupled).
describe("cancellation_case_opened wording (spec s.2 — completion vs. pending)", () => {
  const COMPLETION_WORD: Record<"KY" | "RU" | "EN", RegExp> = {
    KY: /жокко\s+чыгар\w*/i,
    RU: /отмен(ил[аи]?|ена|ён[аы]?)/i,
    EN: /cancel+ed/i,
  };

  for (const lang of ["KY", "RU", "EN"] as const) {
    it(`composeFallbackReply states the cancellation as a completed fact in ${lang}`, () => {
      const text = composeFallbackReply("cancellation_case_opened", lang);
      expect(text).toMatch(COMPLETION_WORD[lang]);
    });
  }

  it("situationForOutcome describes cancellation as verified/completed, not pending", () => {
    const situation = situationForOutcome("cancellation_case_opened");
    expect(situation).toMatch(/cancel+ed|completed/i);
    expect(situation).not.toMatch(/pending review|awaiting confirmation|will check/i);
  });

  it("does not use hedging/pending phrasing for an outcome that is already verified complete", () => {
    for (const lang of ["KY", "RU", "EN"] as const) {
      const text = composeFallbackReply("cancellation_case_opened", lang);
      // Pending-request phrasing this outcome must NOT use, since the
      // cancellation is already a completed, verified fact at this point.
      expect(text).not.toMatch(/проверю статус|сообщу результат|checking the status|will confirm/i);
    }
  });
});
