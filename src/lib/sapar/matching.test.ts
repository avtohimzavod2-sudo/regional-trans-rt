import { describe, expect, it } from "vitest";
import { rankQuoteCandidates } from "./matching";
import type { QuoteCandidate } from "./types";

function candidate(overrides: Partial<QuoteCandidate>): QuoteCandidate {
  return {
    providerCode: "internal_mock",
    executorId: null,
    executorSource: null,
    executorReliabilityScore: null,
    executorVerification: null,
    priceSom: 500,
    priceSource: "ESTIMATE",
    currency: "KGS",
    estimatedPickupAt: null,
    estimatedDeliveryAt: null,
    serviceType: "STANDARD",
    doorToDoor: false,
    lastMileIncluded: false,
    confidence: 0.5,
    rankScore: 0,
    rankReasons: [],
    legKinds: ["INTERCITY"],
    ...overrides,
  };
}

describe("rankQuoteCandidates", () => {
  it("returns an empty array for an empty input", () => {
    expect(rankQuoteCandidates([])).toEqual([]);
  });

  it("ranks a highly reliable, verified, cheaper candidate above a costlier unverified one", () => {
    const cheapReliable = candidate({
      priceSom: 400,
      executorId: "exec-1",
      executorReliabilityScore: 0.95,
      executorVerification: "VERIFIED",
    });
    const pricier = candidate({ priceSom: 900, executorId: "exec-2", executorReliabilityScore: 0.3, executorVerification: "UNVERIFIED" });

    const ranked = rankQuoteCandidates([pricier, cheapReliable]);
    expect(ranked[0].executorId).toBe("exec-1");
    expect(ranked[0].rankReasons).toContain("HIGH_RELIABILITY");
    expect(ranked[0].rankReasons).toContain("VERIFIED_PARTNER");
    expect(ranked[0].rankReasons).toContain("LOW_PRICE");
  });

  it("scores a brand-new executor (null reliability) at the neutral midpoint, not as unreliable", () => {
    const established = candidate({ executorId: "exec-est", executorReliabilityScore: 0.5, priceSom: 500 });
    const brandNew = candidate({ executorId: "exec-new", executorReliabilityScore: null, priceSom: 500 });

    const ranked = rankQuoteCandidates([established, brandNew]);
    const newCand = ranked.find((c) => c.executorId === "exec-new")!;
    expect(newCand.rankReasons).toContain("NEW_EXECUTOR_UNCERTAIN");
    // Same declared reliability (0.5) and same price -> scores should match.
    const estCand = ranked.find((c) => c.executorId === "exec-est")!;
    expect(newCand.rankScore).toBeCloseTo(estCand.rankScore, 5);
  });

  it("does not flag a candidate with no bound executor as NEW_EXECUTOR_UNCERTAIN", () => {
    const internal = candidate({ executorId: null, executorReliabilityScore: null });
    const ranked = rankQuoteCandidates([internal]);
    expect(ranked[0].rankReasons).not.toContain("NEW_EXECUTOR_UNCERTAIN");
  });

  it("marks direct-route candidates and rewards fewer handoffs", () => {
    const direct = candidate({ executorId: "exec-direct", legKinds: ["INTERCITY"] });
    const transfer = candidate({ executorId: "exec-transfer", legKinds: ["TRANSFER", "LAST_MILE"] });
    const ranked = rankQuoteCandidates([direct, transfer]);
    const directRanked = ranked.find((c) => c.executorId === "exec-direct")!;
    expect(directRanked.rankReasons).toContain("DIRECT_ROUTE");
    expect(directRanked.rankReasons).toContain("FEWER_HANDOFFS");
  });

  it("never lets an unverified cheaper executor outrank a verified reliable one (AGENTS hardening spec s.11 worked example)", () => {
    const verified = candidate({
      priceSom: 700,
      executorId: "exec-verified",
      executorReliabilityScore: 0.95,
      executorVerification: "VERIFIED",
    });
    const unverified = candidate({
      priceSom: 600,
      executorId: "exec-unverified",
      executorReliabilityScore: null,
      executorVerification: "UNVERIFIED",
    });

    const ranked = rankQuoteCandidates([unverified, verified]);
    expect(ranked[0].executorId).toBe("exec-verified");
  });

  it("sorts candidates best-first by rankScore", () => {
    const low = candidate({ priceSom: 1000, executorReliabilityScore: 0.1 });
    const high = candidate({ priceSom: 300, executorReliabilityScore: 0.9, executorVerification: "VERIFIED", doorToDoor: true });
    const ranked = rankQuoteCandidates([low, high]);
    expect(ranked[0].rankScore).toBeGreaterThanOrEqual(ranked[1].rankScore);
  });
});
