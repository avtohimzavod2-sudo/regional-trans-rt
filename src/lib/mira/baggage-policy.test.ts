import { describe, expect, it } from "vitest";
import {
  classifyBaggageWeight,
  DEFAULT_BAGGAGE_POLICY,
  extractBaggageWeightKg,
  isLikelyCargoNotBaggage,
  resolveBaggageCharges,
  type BaggagePolicyConfig,
} from "./baggage-policy";

// Injected config, distinct from DEFAULT_BAGGAGE_POLICY, so these tests never
// silently pass just because they happen to match the current defaults —
// per Mira Pass 1 spec s.13: "Tests may inject explicit threshold values."
const TEST_POLICY: BaggagePolicyConfig = { normalMaxKg: 25, moderateMaxKg: 50, significantExcessFeeSom: 100 };

describe("classifyBaggageWeight (spec s.24-E)", () => {
  it("classifies normal baggage", () => {
    expect(classifyBaggageWeight(10, TEST_POLICY)).toBe("NORMAL");
  });

  it("classifies exactly at the normal boundary as NORMAL (inclusive)", () => {
    expect(classifyBaggageWeight(25, TEST_POLICY)).toBe("NORMAL");
  });

  it("classifies just over the normal boundary as MODERATE_EXCESS", () => {
    expect(classifyBaggageWeight(26, TEST_POLICY)).toBe("MODERATE_EXCESS");
  });

  it("classifies moderate excess", () => {
    expect(classifyBaggageWeight(40, TEST_POLICY)).toBe("MODERATE_EXCESS");
  });

  it("classifies significant excess", () => {
    expect(classifyBaggageWeight(70, TEST_POLICY)).toBe("SIGNIFICANT_EXCESS");
  });

  it("uses DEFAULT_BAGGAGE_POLICY when no config is injected", () => {
    expect(classifyBaggageWeight(10)).toBe("NORMAL");
    expect(classifyBaggageWeight(DEFAULT_BAGGAGE_POLICY.normalMaxKg + DEFAULT_BAGGAGE_POLICY.moderateMaxKg + 1)).toBe("SIGNIFICANT_EXCESS");
  });
});

describe("resolveBaggageCharges — RT fee vs driver charge stay separate (spec s.14-s.16)", () => {
  it("NORMAL: RT fee is 0, no fake surcharge", () => {
    const charges = resolveBaggageCharges("NORMAL", null, TEST_POLICY);
    expect(charges.rtExtraBaggageFeeSom).toBe(0);
    expect(charges.driverExtraBaggageChargeSom).toBeNull();
  });

  it("MODERATE_EXCESS: RT fee is 0, driver charge (when known) stays separate and untouched", () => {
    const charges = resolveBaggageCharges("MODERATE_EXCESS", 200, TEST_POLICY);
    expect(charges.rtExtraBaggageFeeSom).toBe(0);
    expect(charges.driverExtraBaggageChargeSom).toBe(200);
  });

  it("MODERATE_EXCESS: driver charge stays null (pending) when unknown — never invented", () => {
    const charges = resolveBaggageCharges("MODERATE_EXCESS", null, TEST_POLICY);
    expect(charges.driverExtraBaggageChargeSom).toBeNull();
  });

  it("SIGNIFICANT_EXCESS: RT fee is the configured fee, driver surcharge may still coexist separately", () => {
    const charges = resolveBaggageCharges("SIGNIFICANT_EXCESS", 300, TEST_POLICY);
    expect(charges.rtExtraBaggageFeeSom).toBe(100);
    expect(charges.driverExtraBaggageChargeSom).toBe(300);
  });

  it("never merges RT fee and driver charge into a single number", () => {
    const charges = resolveBaggageCharges("SIGNIFICANT_EXCESS", 300, TEST_POLICY);
    expect(charges.rtExtraBaggageFeeSom + (charges.driverExtraBaggageChargeSom ?? 0)).not.toBe(charges.rtExtraBaggageFeeSom);
    expect(charges).toStrictEqual({ tier: "SIGNIFICANT_EXCESS", rtExtraBaggageFeeSom: 100, driverExtraBaggageChargeSom: 300 });
  });
});

describe("extractBaggageWeightKg", () => {
  it("extracts a kg-suffixed number", () => {
    expect(extractBaggageWeightKg("багажа 25 кг")).toBe(25);
  });

  it("extracts a compact 'кг' mention with no space", () => {
    expect(extractBaggageWeightKg("30кг вещей")).toBe(30);
  });

  it("extracts an English 'kg' mention", () => {
    expect(extractBaggageWeightKg("about 40 kg of luggage")).toBe(40);
  });

  it("returns null when no weight is stated — never guesses", () => {
    expect(extractBaggageWeightKg("у меня много вещей")).toBeNull();
  });
});

describe("isLikelyCargoNotBaggage (spec s.17 — not decided from weight alone)", () => {
  it("a passenger with normal suitcases is baggage, not cargo", () => {
    expect(isLikelyCargoNotBaggage({ pieces: 2, weightKg: 25, text: "два чемодана" })).toBe(false);
  });

  it("high volume but relatively low total weight, described commercially, is cargo", () => {
    expect(isLikelyCargoNotBaggage({ pieces: 3, weightKg: 15, text: "3 больших ящика товара" })).toBe(true);
  });

  it("many commercial boxes is cargo even without a large weight figure", () => {
    expect(isLikelyCargoNotBaggage({ pieces: 8, weightKg: 20, text: "8 коробок" })).toBe(true);
  });

  it("an obviously separate cargo case (bulk, for resale) is cargo", () => {
    expect(isLikelyCargoNotBaggage({ pieces: 10, text: "везу партию товара оптом для магазина" })).toBe(true);
  });

  it("mixed passenger + cargo case: commercial wording alone is enough to flag it", () => {
    expect(isLikelyCargoNotBaggage({ pieces: 1, weightKg: 20, text: "личный чемодан плюс коробки с товаром" })).toBe(true);
  });
});
