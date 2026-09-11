import { beforeEach, describe, expect, it, vi } from "vitest";

// classifyMarketRole itself calls generateObject (an LLM) — same as
// src/lib/nlp/extract.ts, this codebase has no precedent for hitting a real
// model in a unit test. Two things are still directly testable without a
// real LLM call: (1) isActionableClassification's pure gating logic (spec
// s.14 item Q — ambiguous/spam/low-confidence never actionable), and (2) that
// the system prompt classifyMarketRole actually sends really does instruct
// the model on Kyrgyz/simplified-Kyrgyz/mixed RU-KY handling (spec s.14 item
// R) rather than silently regressing to Russian-only instructions — verified
// by mocking only the external `ai` boundary and capturing the call args.
const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", () => ({ generateObject: generateObjectMock }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn((name: string) => name) }));

import { classifyMarketRole, isActionableClassification, MIN_ACTIONABLE_CONFIDENCE, type MarketRoleClassification } from "./role-classifier";

function classification(overrides: Partial<MarketRoleClassification> = {}): MarketRoleClassification {
  return {
    role: "DRIVER",
    language: "KY",
    confidence: 0.9,
    originText: null,
    destinationText: null,
    departureTimeText: null,
    passengerCount: null,
    seatsAvailable: null,
    vehicleText: null,
    cargoDescription: null,
    businessCategoryGuess: null,
    capacityText: null,
    temperatureCapability: null,
    backhaulText: null,
    zonesText: null,
    ...overrides,
  };
}

describe("isActionableClassification (spec s.14 item Q: ambiguous never triggers outreach)", () => {
  it("rejects AMBIGUOUS regardless of confidence", () => {
    expect(isActionableClassification(classification({ role: "AMBIGUOUS", confidence: 0.99 }))).toBe(false);
  });

  it("rejects IRRELEVANT_SPAM regardless of confidence", () => {
    expect(isActionableClassification(classification({ role: "IRRELEVANT_SPAM", confidence: 0.99 }))).toBe(false);
  });

  it("rejects a confidence strictly below the floor even for an otherwise-clear role", () => {
    expect(isActionableClassification(classification({ role: "DRIVER", confidence: MIN_ACTIONABLE_CONFIDENCE - 0.01 }))).toBe(false);
  });

  it("accepts a confidence exactly at the floor for a real role", () => {
    expect(isActionableClassification(classification({ role: "DRIVER", confidence: MIN_ACTIONABLE_CONFIDENCE }))).toBe(true);
  });

  it("accepts every non-ambiguous, non-spam role once the confidence floor is cleared", () => {
    for (const role of ["PASSENGER", "DRIVER", "DISPATCHER_INTERMEDIARY", "PARCEL_CARGO_POST", "BUSINESS_ADVERTISEMENT", "DELIVERY_EXECUTOR", "CARGO_CARRIER"] as const) {
      expect(isActionableClassification(classification({ role, confidence: 0.9 }))).toBe(true);
    }
  });
});

describe("classifyMarketRole's prompt contract (spec s.14 item R: Kyrgyz / simplified-Kyrgyz / mixed RU-KY)", () => {
  beforeEach(() => {
    generateObjectMock.mockClear();
  });

  it("instructs the model on literary Kyrgyz, Kyrgyz without special letters, colloquial Kyrgyz, and mixed Kyrgyz-Russian", async () => {
    generateObjectMock.mockResolvedValue({ object: classification() });

    await classifyMarketRole("ошко кетем 2 орун бар");

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const call = generateObjectMock.mock.calls[0][0] as { system: string; prompt: string };
    expect(call.system).toMatch(/literary Kyrgyz/i);
    expect(call.system).toMatch(/without special Kyrgyz letters/i);
    expect(call.system).toMatch(/colloquial Kyrgyz/i);
    expect(call.system).toMatch(/mixed Kyrgyz-Russian/i);
    expect(call.prompt).toBe("ошко кетем 2 орун бар");
  });

  it("never asks the model to extract a phone number", async () => {
    generateObjectMock.mockResolvedValue({ object: classification() });

    await classifyMarketRole("текст");

    const call = generateObjectMock.mock.calls[0][0] as { system: string };
    expect(call.system).toMatch(/never output a phone number/i);
  });

  it("passes the raw source text through unmodified rather than pre-parsing it", async () => {
    generateObjectMock.mockResolvedValue({ object: classification() });
    const raw = "Фура 20 тонн Бишкек–Ош, есть обратка";

    await classifyMarketRole(raw);

    const call = generateObjectMock.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toBe(raw);
  });
});
