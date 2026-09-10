import { afterEach, describe, expect, it } from "vitest";
import { getEtaStalenessMinutes } from "./config";

const ENV_KEYS = ["CRM_AUTO_ETA_STALENESS_MINUTES"];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("CRM Auto config defaults", () => {
  it("falls back to a safe default when nothing is configured", () => {
    expect(getEtaStalenessMinutes()).toBe(30);
  });

  it("reads a valid override from the environment", () => {
    process.env.CRM_AUTO_ETA_STALENESS_MINUTES = "45";
    expect(getEtaStalenessMinutes()).toBe(45);
  });

  it("rejects a non-numeric override and falls back to default", () => {
    process.env.CRM_AUTO_ETA_STALENESS_MINUTES = "soon";
    expect(getEtaStalenessMinutes()).toBe(30);
  });

  it("rejects a zero or negative override", () => {
    process.env.CRM_AUTO_ETA_STALENESS_MINUTES = "-5";
    expect(getEtaStalenessMinutes()).toBe(30);
  });
});
