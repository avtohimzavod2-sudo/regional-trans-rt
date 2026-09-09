import { describe, expect, it } from "vitest";
import { buildToneGuidance, type ToneGuidanceContext } from "./tone-guidance";

const BASE: ToneGuidanceContext = {
  language: "RU",
  outcome: "unrecognized",
  requiresClarification: false,
  isRouteCoverageGap: false,
  hasDriverShortageSignal: false,
};

describe("buildToneGuidance (Mira Professional Communication Pass s.6)", () => {
  it("always returns non-empty guidance, for every outcome", () => {
    const outcomes: ToneGuidanceContext["outcome"][] = [
      "trip_request_created",
      "driver_offer_created",
      "cancellation_case_opened",
      "group_message_recorded",
      "group_message_skipped",
      "unrecognized",
    ];
    for (const outcome of outcomes) {
      for (const language of ["KY", "RU", "EN"] as const) {
        expect(buildToneGuidance({ ...BASE, outcome, language }).length).toBeGreaterThan(0);
      }
    }
  });

  it("adds the Kyrgyz register note only for KY, never for RU/EN", () => {
    const ky = buildToneGuidance({ ...BASE, language: "KY" });
    const ru = buildToneGuidance({ ...BASE, language: "RU" });
    const en = buildToneGuidance({ ...BASE, language: "EN" });
    expect(ky).toMatch(/write correctly/i);
    expect(ru).not.toMatch(/write correctly/i);
    expect(en).not.toMatch(/write correctly/i);
  });

  it("gives cancellation-completion guidance for cancellation_case_opened, taking priority over a stray clarification flag", () => {
    const text = buildToneGuidance({ ...BASE, outcome: "cancellation_case_opened", requiresClarification: true });
    expect(text).toMatch(/cancellation is already confirmed and complete/i);
    expect(text).not.toMatch(/ask for only the missing information/i);
  });

  it("gives route-not-yet-covered guidance when isRouteCoverageGap is set, taking priority over a stray clarification flag", () => {
    const text = buildToneGuidance({ ...BASE, isRouteCoverageGap: true, requiresClarification: true });
    expect(text).toMatch(/doesn't operate this route yet/i);
    expect(text).not.toMatch(/ask for only the missing information/i);
  });

  it("gives clarification guidance when requiresClarification is set and nothing higher-priority applies", () => {
    const text = buildToneGuidance({ ...BASE, requiresClarification: true });
    expect(text).toMatch(/ask for only the missing information/i);
  });

  it("gives plain success guidance for trip_request_created with no driver-shortage signal", () => {
    const text = buildToneGuidance({ ...BASE, outcome: "trip_request_created" });
    expect(text).toMatch(/confirmed success/i);
    expect(text).not.toMatch(/demand is genuinely high/i);
  });

  it("adds the demand-encouragement clause for driver_offer_created only when hasDriverShortageSignal is true", () => {
    const withSignal = buildToneGuidance({ ...BASE, outcome: "driver_offer_created", hasDriverShortageSignal: true });
    const withoutSignal = buildToneGuidance({ ...BASE, outcome: "driver_offer_created", hasDriverShortageSignal: false });
    expect(withSignal).toMatch(/demand is genuinely high/i);
    expect(withoutSignal).not.toMatch(/demand is genuinely high/i);
  });

  it("falls back to a neutral acknowledgment tone for group_message_recorded/skipped", () => {
    const recorded = buildToneGuidance({ ...BASE, outcome: "group_message_recorded" });
    const skipped = buildToneGuidance({ ...BASE, outcome: "group_message_skipped" });
    expect(recorded).toMatch(/nothing unusual/i);
    expect(skipped).toMatch(/nothing unusual/i);
  });

  it("always includes the no-blame baseline register regardless of situation", () => {
    const text = buildToneGuidance({ ...BASE, outcome: "cancellation_case_opened" });
    expect(text).toMatch(/never blame/i);
  });
});
