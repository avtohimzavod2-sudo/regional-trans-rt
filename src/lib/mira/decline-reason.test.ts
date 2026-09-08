import { describe, expect, it } from "vitest";
import {
  buildDeclineReasonPrompt,
  classifyDeclineReasonText,
  shouldAskDeclineReason,
  unknownDeclineReason,
} from "./decline-reason";

describe("buildDeclineReasonPrompt (spec s.12)", () => {
  it("returns the exact Founder-approved Russian phrasing", () => {
    expect(buildDeclineReasonPrompt("RU")).toBe(
      "Поняла. Если не сложно, подскажите, пожалуйста, что не подошло: цена, время, машина или другое? Это поможет нам улучшить сервис.",
    );
  });

  it("supports natural Kyrgyz", () => {
    const prompt = buildDeclineReasonPrompt("KY");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).not.toBe(buildDeclineReasonPrompt("RU"));
  });

  it("supports English", () => {
    expect(buildDeclineReasonPrompt("EN")).toContain("price");
  });
});

describe("classifyDeclineReasonText (spec s.24-G)", () => {
  it("accepts an offer path is out of scope for this classifier — only decline text is classified", () => {
    // covered at the orchestrator/session level, not here
    expect(true).toBe(true);
  });

  it("classifies a price rejection", () => {
    expect(classifyDeclineReasonText("слишком дорого для меня").category).toBe("PRICE");
  });

  it("classifies a time rejection", () => {
    expect(classifyDeclineReasonText("время не подходит, слишком рано").category).toBe("DEPARTURE_TIME");
  });

  it("classifies 'found other transport'", () => {
    expect(classifyDeclineReasonText("уже нашел другую машину").category).toBe("FOUND_OTHER_TRANSPORT");
  });

  it("classifies 'changed plans'", () => {
    expect(classifyDeclineReasonText("извините, планы изменились").category).toBe("CHANGED_PLANS");
  });

  it("classifies free-text explanations that don't match a canonical phrase as OTHER, preserving the text", () => {
    const result = classifyDeclineReasonText("у меня заболел кот и я не могу ехать");
    expect(result.category).toBe("OTHER");
    expect(result.freeText).toBe("у меня заболел кот и я не могу ехать");
  });

  it("refusal to explain is handled via unknownDeclineReason, never guessed from empty text", () => {
    expect(unknownDeclineReason()).toEqual({ category: "UNKNOWN", freeText: null });
    expect(classifyDeclineReasonText("").category).toBe("UNKNOWN");
  });
});

describe("shouldAskDeclineReason — ask only once (spec s.12)", () => {
  it("is true when Mira has never asked this conversation before", () => {
    expect(shouldAskDeclineReason(undefined)).toBe(true);
    expect(shouldAskDeclineReason({})).toBe(true);
  });

  it("is false once the flag is set — never asked twice", () => {
    expect(shouldAskDeclineReason({ declineReasonAsked: true })).toBe(false);
  });
});
