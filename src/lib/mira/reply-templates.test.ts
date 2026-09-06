import { describe, expect, it } from "vitest";
import { composeFallbackReply, situationForOutcome } from "./reply-templates";
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

describe("situationForOutcome", () => {
  it("returns a non-empty description for every outcome", () => {
    for (const outcome of OUTCOMES) {
      expect(situationForOutcome(outcome).length).toBeGreaterThan(0);
    }
  });
});
