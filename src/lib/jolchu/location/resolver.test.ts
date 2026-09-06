import { describe, expect, it } from "vitest";
import { resolveLocation, type LocationResolutionDeps } from "./resolver";
import { MockJolchuModelProvider } from "../providers/mock";
import { MockRouteProvider } from "../route-providers/mock";
import { FailingRouteProvider, FailingJolchuModelProvider } from "../training/test-doubles";

function mockDeps(overrides: Partial<LocationResolutionDeps> = {}): LocationResolutionDeps {
  return {
    modelProvider: new MockJolchuModelProvider(),
    fallbackModelProvider: new MockJolchuModelProvider(),
    routeProvider: new MockRouteProvider(),
    fallbackRouteProvider: new MockRouteProvider(),
    ...overrides,
  };
}

describe("resolveLocation — direct input types (no provider call needed)", () => {
  it("resolves raw coordinates directly, without calling any provider", async () => {
    const deps = mockDeps({ routeProvider: new FailingRouteProvider("should-not-be-called") });
    const outcome = await resolveLocation("42.8746, 74.5698", "SINGLE", deps);
    expect(outcome.location.latitude).toBe(42.8746);
    expect(outcome.location.confidence).toBeGreaterThan(0.9);
    expect(outcome.providerExecutions).toHaveLength(0);
  });

  it("resolves a live-location payload directly", async () => {
    const deps = mockDeps();
    const outcome = await resolveLocation({ latitude: 42.4907, longitude: 78.3931, isLivePayload: true }, "SINGLE", deps);
    expect(outcome.location.sourceType).toBe("LIVE_LOCATION");
    expect(outcome.location.latitude).toBe(42.4907);
  });

  it("flags invalid live-location coordinates instead of passing them through", async () => {
    const deps = mockDeps();
    const outcome = await resolveLocation({ latitude: 999, longitude: 74.5698 }, "SINGLE", deps);
    expect(outcome.location.latitude).toBeNull();
    expect(outcome.warnings).toContain("invalid_live_location_payload");
  });

  it("resolves a Google Maps link with embedded coordinates directly", async () => {
    const deps = mockDeps();
    const outcome = await resolveLocation("https://maps.google.com/@42.87,74.59,17z", "SINGLE", deps);
    expect(outcome.location.latitude).toBe(42.87);
    expect(outcome.location.sourceType).toBe("GOOGLE_MAPS_LINK");
  });

  it("flags an unresolvable short map link for confirmation rather than guessing", async () => {
    const deps = mockDeps();
    const outcome = await resolveLocation("https://goo.gl/maps/abcd1234", "SINGLE", deps);
    expect(outcome.location.latitude).toBeNull();
    expect(outcome.location.ambiguity).toBe(true);
  });
});

describe("resolveLocation — text requiring the model + route provider", () => {
  it("resolves a known settlement by name via geocode", async () => {
    const outcome = await resolveLocation("Каракол", "DESTINATION", mockDeps());
    expect(outcome.location.latitude).toBeCloseTo(42.4907, 3);
    expect(outcome.location.ambiguity).toBe(false);
  });

  it("returns ambiguityCandidates and null coordinates for a known ambiguous landmark — never picks one", async () => {
    const outcome = await resolveLocation("Аламедин", "SINGLE", mockDeps());
    expect(outcome.location.latitude).toBeNull();
    expect(outcome.location.ambiguity).toBe(true);
    expect(outcome.ambiguityCandidates).not.toBeNull();
    expect(outcome.ambiguityCandidates!.length).toBeGreaterThan(1);
  });

  it("returns FAILED-equivalent (no location, no crash) for unresolvable text", async () => {
    const outcome = await resolveLocation("совершенно неизвестное место xyzabc", "SINGLE", mockDeps());
    expect(outcome.location.latitude).toBeNull();
    expect(outcome.warnings).toContain("no_geocode_candidates");
  });

  it("falls back to the fallback route provider when the primary is down", async () => {
    const deps = mockDeps({ routeProvider: new FailingRouteProvider("google_maps") });
    const outcome = await resolveLocation("Каракол", "DESTINATION", deps);
    expect(outcome.location.latitude).toBeCloseTo(42.4907, 3);
    expect(outcome.routeProviderUnavailable).toBe(false);
    expect(outcome.providerExecutions.some((e) => e.provider === "google_maps" && !e.ok)).toBe(true);
  });

  it("reports ROUTE_PROVIDER_UNAVAILABLE when both route providers are down — never fabricates a location", async () => {
    const deps = mockDeps({
      routeProvider: new FailingRouteProvider("google_maps"),
      fallbackRouteProvider: new FailingRouteProvider("two_gis"),
    });
    const outcome = await resolveLocation("Каракол", "DESTINATION", deps);
    expect(outcome.routeProviderUnavailable).toBe(true);
    expect(outcome.location.latitude).toBeNull();
  });

  it("falls back to the fallback model provider when the primary model is down, and still resolves", async () => {
    const deps = mockDeps({ modelProvider: new FailingJolchuModelProvider() });
    const outcome = await resolveLocation("Каракол", "DESTINATION", deps);
    expect(outcome.location.latitude).toBeCloseTo(42.4907, 3);
    expect(outcome.providerExecutions.some((e) => e.provider === "failing-model" && !e.ok)).toBe(true);
  });

  it("never lets a null geocode query reach the provider when both model providers fail — falls back to raw text", async () => {
    const deps = mockDeps({ modelProvider: new FailingJolchuModelProvider(), fallbackModelProvider: new FailingJolchuModelProvider() });
    const outcome = await resolveLocation("Каракол", "DESTINATION", deps);
    expect(outcome.location.latitude).toBeCloseTo(42.4907, 3);
  });
});
