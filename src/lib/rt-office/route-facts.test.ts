import { beforeEach, describe, expect, it, vi } from "vitest";

// Coverage for RT OFFICE's last-mile Jolchu boundary — spec items H (Jolchu
// timeout) and I (invalid/ambiguous geolocation) plus the general fail-closed
// rule ("никогда не фабрикуй успешный матч"): every real failure mode from
// Jolchu must map onto exactly one NoSupplyReason, chosen by what actually
// happened, never defaulted or silently swallowed into a false positive.

const { resolveRouteIntelligenceMock } = vi.hoisted(() => ({
  resolveRouteIntelligenceMock: vi.fn(),
}));

vi.mock("@/lib/jolchu/orchestrator", () => ({ resolveRouteIntelligence: resolveRouteIntelligenceMock }));

import { resolvePickupRouteFacts, getRouteFactsTimeoutMs } from "./route-facts";

const ctx = { traceId: "rt_test123", hop: 0 };

function jolchuResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    requestId: "jolchu-req-1",
    status: "RESOLVED",
    origin: null,
    destination: null,
    waypoints: [],
    route: null,
    confidence: 0.9,
    ambiguity: false,
    ambiguityCandidates: null,
    warnings: [],
    requiresHumanOrUserConfirmation: false,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("resolvePickupRouteFacts", () => {
  it("is a no-op ok:true with route:null when the request has no pickupPoint at all (not every request has one)", async () => {
    const result = await resolvePickupRouteFacts({ ctx, pickupPoint: null, originStopLabel: "Bishkek Vostochny Autovokzal" });

    expect(result).toEqual({ ok: true, route: null });
    expect(resolveRouteIntelligenceMock).not.toHaveBeenCalled();
  });

  it("resolves a real pickup point and returns the route intelligence result untouched", async () => {
    const resolved = jolchuResult({ status: "RESOLVED" });
    resolveRouteIntelligenceMock.mockResolvedValue(resolved);

    const result = await resolvePickupRouteFacts({
      ctx,
      pickupPoint: "ул. Ахунбаева 123",
      originStopLabel: "Bishkek Vostochny Autovokzal",
      conversationId: "req-1",
    });

    expect(result).toEqual({ ok: true, route: resolved });
    expect(resolveRouteIntelligenceMock).toHaveBeenCalledWith({
      reasonCode: "LAST_MILE",
      origin: "ул. Ахунбаева 123",
      destination: "Bishkek Vostochny Autovokzal",
      conversationId: "req-1",
      ctx,
    });
  });

  it("maps NEEDS_CONFIRMATION to NEEDS_CLARIFICATION — never silently proceeds on an ambiguous address (spec I)", async () => {
    resolveRouteIntelligenceMock.mockResolvedValue(jolchuResult({ status: "NEEDS_CONFIRMATION" }));

    const result = await resolvePickupRouteFacts({ ctx, pickupPoint: "some vague place", originStopLabel: "Stop" });

    expect(result).toEqual({ ok: false, reason: "NEEDS_CLARIFICATION", detail: "JOLCHU_NEEDS_CONFIRMATION" });
  });

  it("maps PARTIAL to NEEDS_CLARIFICATION as well", async () => {
    resolveRouteIntelligenceMock.mockResolvedValue(jolchuResult({ status: "PARTIAL" }));

    const result = await resolvePickupRouteFacts({ ctx, pickupPoint: "partially known place", originStopLabel: "Stop" });

    expect(result).toEqual({ ok: false, reason: "NEEDS_CLARIFICATION", detail: "JOLCHU_PARTIAL" });
  });

  it("maps a real FAILED outage to TEMPORARILY_UNAVAILABLE, carrying Jolchu's own error message", async () => {
    resolveRouteIntelligenceMock.mockResolvedValue(jolchuResult({ status: "FAILED", errorMessage: "ROUTE_PROVIDER_UNAVAILABLE" }));

    const result = await resolvePickupRouteFacts({ ctx, pickupPoint: "somewhere", originStopLabel: "Stop" });

    expect(result).toEqual({ ok: false, reason: "TEMPORARILY_UNAVAILABLE", detail: "ROUTE_PROVIDER_UNAVAILABLE" });
  });

  it("falls back to a generic FAILED detail when Jolchu supplies no errorMessage", async () => {
    resolveRouteIntelligenceMock.mockResolvedValue(jolchuResult({ status: "FAILED", errorMessage: null }));

    const result = await resolvePickupRouteFacts({ ctx, pickupPoint: "somewhere", originStopLabel: "Stop" });

    expect(result).toEqual({ ok: false, reason: "TEMPORARILY_UNAVAILABLE", detail: "JOLCHU_FAILED" });
  });

  it("treats a Jolchu timeout as TEMPORARILY_UNAVAILABLE, never as a fabricated match (spec H)", async () => {
    vi.stubEnv("RT_OFFICE_ROUTE_FACTS_TIMEOUT_MS", "20");
    resolveRouteIntelligenceMock.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(jolchuResult()), 5000)));

    const result = await resolvePickupRouteFacts({ ctx, pickupPoint: "slow address", originStopLabel: "Stop" });

    expect(result).toEqual({ ok: false, reason: "TEMPORARILY_UNAVAILABLE", detail: "JOLCHU_TIMEOUT" });
  });

  it("treats an unexpected rejection from Jolchu as TEMPORARILY_UNAVAILABLE rather than crashing the caller", async () => {
    resolveRouteIntelligenceMock.mockRejectedValue(new Error("connection reset"));

    const result = await resolvePickupRouteFacts({ ctx, pickupPoint: "somewhere", originStopLabel: "Stop" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("TEMPORARILY_UNAVAILABLE");
      expect(result.detail).toContain("JOLCHU_ERROR");
      expect(result.detail).toContain("connection reset");
    }
  });
});

describe("getRouteFactsTimeoutMs", () => {
  it("defaults to 8000ms when unset or invalid", () => {
    vi.stubEnv("RT_OFFICE_ROUTE_FACTS_TIMEOUT_MS", "");
    expect(getRouteFactsTimeoutMs()).toBe(8000);

    vi.stubEnv("RT_OFFICE_ROUTE_FACTS_TIMEOUT_MS", "not-a-number");
    expect(getRouteFactsTimeoutMs()).toBe(8000);

    vi.stubEnv("RT_OFFICE_ROUTE_FACTS_TIMEOUT_MS", "-5");
    expect(getRouteFactsTimeoutMs()).toBe(8000);
  });

  it("honors a valid positive override", () => {
    vi.stubEnv("RT_OFFICE_ROUTE_FACTS_TIMEOUT_MS", "3000");
    expect(getRouteFactsTimeoutMs()).toBe(3000);
  });
});
