import { describe, expect, it } from "vitest";
import { BENCHMARK_CASES } from "./benchmark-cases";

describe("BENCHMARK_CASES", () => {
  it("contains exactly the 30 mandatory scenarios with unique codes", () => {
    expect(BENCHMARK_CASES.length).toBe(30);
    const codes = BENCHMARK_CASES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("includes both ROUTING_DECISION and FULL_RESOLUTION cases", () => {
    const kinds = new Set(BENCHMARK_CASES.map((c) => c.kind));
    expect(kinds.has("ROUTING_DECISION")).toBe(true);
    expect(kinds.has("FULL_RESOLUTION")).toBe(true);
  });

  it("covers negative routing-decision cases (Jolchu must stay silent on ordinary chat)", () => {
    const negatives = BENCHMARK_CASES.filter((c) => c.kind === "ROUTING_DECISION" && !c.expectedJolchuRequired);
    expect(negatives.length).toBeGreaterThan(0);
  });

  it("covers every mandatory reason code across positive routing-decision cases", () => {
    const reasonCodes = new Set(
      BENCHMARK_CASES.filter((c) => c.kind === "ROUTING_DECISION" && c.expectedJolchuRequired).map(
        (c) => (c as { expectedReasonCode: string | null }).expectedReasonCode,
      ),
    );
    for (const code of ["LOCATION_RESOLUTION", "ROUTE_CALCULATION", "TRAFFIC_CHECK", "LAST_MILE", "AMBIGUITY_CHECK"]) {
      expect(reasonCodes.has(code)).toBe(true);
    }
  });

  it("covers fallback/outage scenarios via injected failing providers", () => {
    const fallbackCases = BENCHMARK_CASES.filter((c) => c.category === "FALLBACK");
    expect(fallbackCases.length).toBeGreaterThan(0);
  });

  it("covers at least one structurally-guaranteed hallucination-forbidden case", () => {
    const guarded = BENCHMARK_CASES.filter(
      (c) => c.kind === "FULL_RESOLUTION" && (c as { expectedRouteHallucinationForbidden?: boolean }).expectedRouteHallucinationForbidden,
    );
    expect(guarded.length).toBeGreaterThan(0);
  });

  it("never hardcodes a price/fare/commission field key on any case", () => {
    const keys = new Set(BENCHMARK_CASES.flatMap((c) => Object.keys(c)));
    for (const forbidden of ["price", "fare", "commission", "tariff", "cost"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});
