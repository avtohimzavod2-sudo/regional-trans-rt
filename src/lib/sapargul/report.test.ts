import { describe, expect, it } from "vitest";
import { severityForAgeMs } from "./report";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("severityForAgeMs", () => {
  it("returns LOW for anything up to and including one day old", () => {
    expect(severityForAgeMs(0)).toBe("LOW");
    expect(severityForAgeMs(ONE_DAY_MS)).toBe("LOW");
  });

  it("returns MEDIUM for anything over one day up to and including three days", () => {
    expect(severityForAgeMs(ONE_DAY_MS + 1)).toBe("MEDIUM");
    expect(severityForAgeMs(3 * ONE_DAY_MS)).toBe("MEDIUM");
  });

  it("returns HIGH for anything over three days", () => {
    expect(severityForAgeMs(3 * ONE_DAY_MS + 1)).toBe("HIGH");
    expect(severityForAgeMs(30 * ONE_DAY_MS)).toBe("HIGH");
  });
});
