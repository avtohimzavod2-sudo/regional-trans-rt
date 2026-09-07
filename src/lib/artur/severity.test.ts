import { describe, expect, it } from "vitest";
import { severityRank, maxSeverity, overallRtStatus, severityForCaseAgeMs, severityForDiscrepancySom, isEmergencySeverity } from "./severity";

describe("severityRank / maxSeverity", () => {
  it("ranks INFO < NORMAL < ATTENTION < HIGH < CRITICAL", () => {
    expect(severityRank("INFO")).toBeLessThan(severityRank("NORMAL"));
    expect(severityRank("NORMAL")).toBeLessThan(severityRank("ATTENTION"));
    expect(severityRank("ATTENTION")).toBeLessThan(severityRank("HIGH"));
    expect(severityRank("HIGH")).toBeLessThan(severityRank("CRITICAL"));
  });

  it("maxSeverity returns the higher-ranked of the two", () => {
    expect(maxSeverity("ATTENTION", "CRITICAL")).toBe("CRITICAL");
    expect(maxSeverity("HIGH", "NORMAL")).toBe("HIGH");
    expect(maxSeverity("INFO", "INFO")).toBe("INFO");
  });
});

describe("overallRtStatus", () => {
  it("returns NORMAL when there are no signals or only INFO/NORMAL signals", () => {
    expect(overallRtStatus([])).toBe("NORMAL");
    expect(overallRtStatus(["INFO", "NORMAL"])).toBe("NORMAL");
  });

  it("returns ATTENTION when the worst signal is ATTENTION", () => {
    expect(overallRtStatus(["NORMAL", "ATTENTION"])).toBe("ATTENTION");
  });

  it("collapses both HIGH and CRITICAL signals to a CRITICAL top-line status", () => {
    expect(overallRtStatus(["ATTENTION", "HIGH"])).toBe("CRITICAL");
    expect(overallRtStatus(["CRITICAL"])).toBe("CRITICAL");
  });
});

describe("severityForCaseAgeMs", () => {
  const hour = 3_600_000;
  it("returns NORMAL under 6 hours", () => {
    expect(severityForCaseAgeMs(5 * hour)).toBe("NORMAL");
  });
  it("returns ATTENTION at 6 hours and up to 24 hours", () => {
    expect(severityForCaseAgeMs(6 * hour)).toBe("ATTENTION");
    expect(severityForCaseAgeMs(23 * hour)).toBe("ATTENTION");
  });
  it("returns HIGH at 24 hours and up to 72 hours", () => {
    expect(severityForCaseAgeMs(24 * hour)).toBe("HIGH");
    expect(severityForCaseAgeMs(71 * hour)).toBe("HIGH");
  });
  it("returns CRITICAL at 72 hours and beyond", () => {
    expect(severityForCaseAgeMs(72 * hour)).toBe("CRITICAL");
    expect(severityForCaseAgeMs(200 * hour)).toBe("CRITICAL");
  });
});

describe("severityForDiscrepancySom", () => {
  it("returns INFO for zero", () => {
    expect(severityForDiscrepancySom(0)).toBe("INFO");
  });
  it("returns NORMAL for a small positive amount", () => {
    expect(severityForDiscrepancySom(500)).toBe("NORMAL");
  });
  it("returns ATTENTION at 3,000 som and up to 20,000", () => {
    expect(severityForDiscrepancySom(3_000)).toBe("ATTENTION");
    expect(severityForDiscrepancySom(19_999)).toBe("ATTENTION");
  });
  it("returns HIGH at 20,000 som and up to 100,000", () => {
    expect(severityForDiscrepancySom(20_000)).toBe("HIGH");
    expect(severityForDiscrepancySom(99_999)).toBe("HIGH");
  });
  it("returns CRITICAL at 100,000 som and beyond", () => {
    expect(severityForDiscrepancySom(100_000)).toBe("CRITICAL");
  });
});

describe("isEmergencySeverity", () => {
  it("is true only for HIGH and CRITICAL (spec s.17: never routine operations)", () => {
    expect(isEmergencySeverity("HIGH")).toBe(true);
    expect(isEmergencySeverity("CRITICAL")).toBe(true);
    expect(isEmergencySeverity("ATTENTION")).toBe(false);
    expect(isEmergencySeverity("NORMAL")).toBe(false);
    expect(isEmergencySeverity("INFO")).toBe(false);
  });
});
