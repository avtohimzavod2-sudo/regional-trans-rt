import { describe, expect, it } from "vitest";
import { classifyRtMode } from "./rt-mode";

describe("classifyRtMode", () => {
  it("classifies all-sandbox/dry-run modes as TEST", () => {
    const result = classifyRtMode({
      miraOutbound: "DRY_RUN",
      acquisitionOutreach: "SANDBOX",
      treasury: "SANDBOX",
    });
    expect(result.kind).toBe("TEST");
    expect(result.subsystems).toHaveLength(3);
  });

  it("classifies all-live/production modes as LIVE", () => {
    const result = classifyRtMode({
      miraOutbound: "LIVE",
      acquisitionOutreach: "LIVE",
      treasury: "PRODUCTION",
    });
    expect(result.kind).toBe("LIVE");
    expect(result.subsystems).toHaveLength(3);
  });

  it("classifies a mix of LIVE and TEST subsystems as MIXED, never as an overall LIVE", () => {
    const result = classifyRtMode({
      miraOutbound: "LIVE",
      acquisitionOutreach: "SANDBOX",
      treasury: "SANDBOX",
    });
    expect(result.kind).toBe("MIXED");
    expect(result.subsystems).toEqual([
      { name: "miraOutbound", raw: "LIVE", normalized: "LIVE" },
      { name: "acquisitionOutreach", raw: "SANDBOX", normalized: "TEST" },
      { name: "treasury", raw: "SANDBOX", normalized: "TEST" },
    ]);
  });

  it("classifies an unrecognized mode string for a single subsystem as UNKNOWN overall, not a partial LIVE/MIXED", () => {
    const result = classifyRtMode({
      miraOutbound: "LIVE",
      acquisitionOutreach: "SOMETHING_NEW",
      treasury: "SANDBOX",
    });
    expect(result.kind).toBe("UNKNOWN");
  });

  it("treats a null modes payload as UNKNOWN, never LIVE", () => {
    expect(classifyRtMode(null).kind).toBe("UNKNOWN");
  });

  it("treats an empty object as UNKNOWN, never LIVE", () => {
    expect(classifyRtMode({}).kind).toBe("UNKNOWN");
  });

  it("treats a non-object payload (string) as UNKNOWN, never LIVE", () => {
    expect(classifyRtMode("LIVE").kind).toBe("UNKNOWN");
  });

  it("treats an array payload as UNKNOWN, never LIVE", () => {
    expect(classifyRtMode(["LIVE", "LIVE"]).kind).toBe("UNKNOWN");
  });

  it("treats undefined as UNKNOWN, never LIVE", () => {
    expect(classifyRtMode(undefined).kind).toBe("UNKNOWN");
  });

  it("treats a non-string value for a subsystem (e.g. a number) as UNKNOWN overall", () => {
    const result = classifyRtMode({ miraOutbound: 1, treasury: "SANDBOX" });
    expect(result.kind).toBe("UNKNOWN");
    expect(result.subsystems.find((s) => s.name === "miraOutbound")).toEqual({
      name: "miraOutbound",
      raw: null,
      normalized: "UNKNOWN",
    });
  });
});
