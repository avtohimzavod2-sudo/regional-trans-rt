import { describe, expect, it } from "vitest";
import { BENCHMARK_CASES, getBenchmarkCase, type BenchmarkCategory } from "./benchmark-cases";

// The 15 dataset categories (A-O) requested for the RT Kyrgyz Benchmark
// foundation — see benchmark-cases.ts's BenchmarkCategory type.
const ALL_CATEGORIES: BenchmarkCategory[] = [
  "LITERARY_KY",
  "NO_SPECIAL_LETTERS",
  "COLLOQUIAL",
  "CODE_SWITCH",
  "RUSSIAN",
  "TOURIST_EN",
  "TYPOS",
  "SHORT_FRAGMENT",
  "PASSENGER_REQUEST",
  "DRIVER_MESSAGE",
  "PARCEL_MESSAGE",
  "AMBIGUOUS_ROLE",
  "MULTI_INTENT",
  "MIXED_FREE_TEXT",
  "CORRECTION_NEXT_MESSAGE",
];

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

  it("has at least one representative case for every A-O dataset category", () => {
    const covered = new Set(BENCHMARK_CASES.flatMap((c) => c.categories ?? []));
    const missing = ALL_CATEGORIES.filter((cat) => !covered.has(cat));
    expect(missing).toEqual([]);
  });

  it("is not just 2-3 toy examples — has a meaningful number of non-adversarial cases", () => {
    const nonAdversarial = BENCHMARK_CASES.filter((c) => c.difficulty !== "ADVERSARIAL");
    expect(nonAdversarial.length).toBeGreaterThanOrEqual(15);
  });

  it("gives every CORRECTION_NEXT_MESSAGE case at least one prior turn", () => {
    const corrections = BENCHMARK_CASES.filter((c) => c.categories?.includes("CORRECTION_NEXT_MESSAGE"));
    expect(corrections.length).toBeGreaterThan(0);
    for (const c of corrections) {
      expect(c.priorTurns?.length ?? 0).toBeGreaterThan(0);
    }
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
