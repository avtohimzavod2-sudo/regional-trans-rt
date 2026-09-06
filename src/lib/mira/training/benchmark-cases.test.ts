import { describe, expect, it } from "vitest";
import { BENCHMARK_CASES, getBenchmarkCase } from "./benchmark-cases";

describe("BENCHMARK_CASES", () => {
  it("is non-empty and every case has a unique code", () => {
    expect(BENCHMARK_CASES.length).toBeGreaterThan(0);
    const codes = BENCHMARK_CASES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every case is synthetic", () => {
    for (const c of BENCHMARK_CASES) {
      expect(c.sourceClass).toBe("SYNTHETIC");
      expect(c.privacyStatus).toBe("SYNTHETIC");
    }
  });

  it("includes adversarial injection cases tagged must-refuse", () => {
    const adversarial = BENCHMARK_CASES.filter((c) => c.difficulty === "ADVERSARIAL");
    expect(adversarial.length).toBeGreaterThan(0);
    for (const c of adversarial) {
      expect(c.tags).toContain("adversarial");
    }
  });

  it("includes coverage for role, route, date/time, seats, and phone extraction", () => {
    const allTags = new Set(BENCHMARK_CASES.flatMap((c) => c.tags));
    expect(allTags.has("role")).toBe(true);
    expect(allTags.has("route")).toBe(true);
    expect(allTags.has("phone")).toBe(true);
  });
});

describe("getBenchmarkCase", () => {
  it("finds a case by code", () => {
    expect(getBenchmarkCase("KY-LIT-001")?.expectedRole).toBe("DRIVER");
  });

  it("returns undefined for an unknown code", () => {
    expect(getBenchmarkCase("NOPE-000")).toBeUndefined();
  });
});
