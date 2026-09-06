import { afterEach, describe, expect, it } from "vitest";
import {
  _resetMiraModelProviderCacheForTests,
  getMiraModelProvider,
  getMiraProviderStatus,
} from "./model-provider";

afterEach(() => {
  _resetMiraModelProviderCacheForTests();
  delete process.env.MIRA_AI_PROVIDER;
  delete process.env.MIRA_GEMINI_API_KEY;
  delete process.env.MIRA_GEMINI_MODEL;
});

describe("getMiraProviderStatus", () => {
  it("reports mock as always ready, regardless of credentials", () => {
    delete process.env.MIRA_AI_PROVIDER;
    const status = getMiraProviderStatus();
    expect(status.configuredProvider).toBe("mock");
    expect(status.ready).toBe(true);
    expect(status.reason).toBeNull();
  });

  it("reports google as not ready when MIRA_GEMINI_API_KEY is unset", () => {
    process.env.MIRA_AI_PROVIDER = "google";
    delete process.env.MIRA_GEMINI_API_KEY;
    const status = getMiraProviderStatus();
    expect(status.configuredProvider).toBe("google");
    expect(status.ready).toBe(false);
    expect(status.reason).toMatch(/MIRA_GEMINI_API_KEY/);
  });

  it("reports google as ready once a key is set, and reflects the configured model", () => {
    process.env.MIRA_AI_PROVIDER = "google";
    process.env.MIRA_GEMINI_API_KEY = "test-key";
    process.env.MIRA_GEMINI_MODEL = "gemini-2.5-flash";
    const status = getMiraProviderStatus();
    expect(status.ready).toBe(true);
    expect(status.modelId).toBe("gemini-2.5-flash");
  });

  it("never throws even with no environment configured at all", () => {
    expect(() => getMiraProviderStatus()).not.toThrow();
  });
});

describe("getMiraModelProvider", () => {
  it("defaults to the mock provider", () => {
    delete process.env.MIRA_AI_PROVIDER;
    _resetMiraModelProviderCacheForTests();
    expect(getMiraModelProvider().providerName).toBe("mock");
  });

  it("selects the google provider when configured, without throwing at construction", () => {
    process.env.MIRA_AI_PROVIDER = "google";
    delete process.env.MIRA_GEMINI_API_KEY;
    _resetMiraModelProviderCacheForTests();
    expect(() => getMiraModelProvider()).not.toThrow();
    expect(getMiraModelProvider().providerName).toBe("google");
  });

  it("caches the provider instance across calls with the same provider kind", () => {
    delete process.env.MIRA_AI_PROVIDER;
    _resetMiraModelProviderCacheForTests();
    expect(getMiraModelProvider()).toBe(getMiraModelProvider());
  });
});
