import { describe, expect, it } from "vitest";
import {
  categorizeDriver,
  computeRepeatScore,
  decideReviewStatus,
  normalizePhone,
  normalizePlate,
  normalizeTelegramUsername,
  scoreFingerprintMatch,
} from "./scout";

describe("normalizePhone", () => {
  it("normalizes a local 0-prefixed Kyrgyz number to +996 form", () => {
    expect(normalizePhone("0700123456")).toBe("996700123456");
  });

  it("normalizes numbers already in 996 form regardless of punctuation", () => {
    expect(normalizePhone("+996 700 123 456")).toBe("996700123456");
  });

  it("returns null for empty input", () => {
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("normalizeTelegramUsername", () => {
  it("strips @ and lowercases", () => {
    expect(normalizeTelegramUsername("@DriverBek")).toBe("driverbek");
  });

  it("returns null for empty input", () => {
    expect(normalizeTelegramUsername("  ")).toBeNull();
    expect(normalizeTelegramUsername(undefined)).toBeNull();
  });
});

describe("normalizePlate", () => {
  it("uppercases and strips separators", () => {
    expect(normalizePlate("01 kg 123 abc")).toBe("01KG123ABC");
  });
});

describe("scoreFingerprintMatch", () => {
  const driver = { normalizedPhone: "996700123456", telegramUsername: "driverbek", carPlate: "01KG123ABC", carModel: "Sienna" };

  it("scores a phone-only match below the auto-link threshold", () => {
    const m = scoreFingerprintMatch({ normalizedPhone: "996700123456", telegramUsername: null, carPlate: null, carModel: null }, driver);
    expect(m.confidence).toBeCloseTo(0.6);
    expect(m.signals).toEqual(["phone_match"]);
    expect(decideReviewStatus(m.confidence)).toBe("PENDING_REVIEW");
  });

  it("scores a phone+telegram match above the auto-link threshold", () => {
    const m = scoreFingerprintMatch({ normalizedPhone: "996700123456", telegramUsername: "driverbek", carPlate: null, carModel: null }, driver);
    expect(m.confidence).toBeCloseTo(0.9);
    expect(decideReviewStatus(m.confidence)).toBe("AUTO_LINKED");
  });

  it("scores no match as zero confidence with no signals", () => {
    const m = scoreFingerprintMatch({ normalizedPhone: "996700000000", telegramUsername: "someoneelse", carPlate: "99XX999", carModel: "Lacetti" }, driver);
    expect(m.confidence).toBe(0);
    expect(m.signals).toEqual([]);
  });

  it("caps confidence at 1 even if every signal matches", () => {
    const m = scoreFingerprintMatch(driver, driver);
    expect(m.confidence).toBe(1);
  });
});

describe("computeRepeatScore / categorizeDriver", () => {
  it("scores an inactive driver as zero / UNKNOWN", () => {
    const score = computeRepeatScore({ distinctDaysActive: 0, distinctGroups: 0, hasReturnLegPosting: false, parcelPostings: 0, sameRouteRepeats: 0 });
    expect(score).toBe(0);
    expect(categorizeDriver(score, false)).toBe("UNKNOWN");
  });

  it("categorizes a moderately active driver as REGULAR", () => {
    const score = computeRepeatScore({ distinctDaysActive: 10, distinctGroups: 2, hasReturnLegPosting: true, parcelPostings: 1, sameRouteRepeats: 5 });
    expect(categorizeDriver(score, false)).toBe("REGULAR");
  });

  it("categorizes a highly active driver as ANCHOR", () => {
    const score = computeRepeatScore({ distinctDaysActive: 30, distinctGroups: 5, hasReturnLegPosting: true, parcelPostings: 10, sameRouteRepeats: 20 });
    expect(categorizeDriver(score, false)).toBe("ANCHOR");
  });

  it("always categorizes a multi-vehicle dispatcher as DISPATCHER_FLEET regardless of score", () => {
    expect(categorizeDriver(0, true)).toBe("DISPATCHER_FLEET");
  });
});
