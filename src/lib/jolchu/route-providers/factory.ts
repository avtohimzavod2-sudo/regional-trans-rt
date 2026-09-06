// Factory for the configured RouteProvider + its fallback, kept separate
// from route-provider.ts (which only defines the interface/status so it has
// zero concrete-class imports and stays trivially importable from anywhere).
import { GoogleMapsRouteProvider } from "./google-maps";
import { TwoGisRouteProvider } from "./two-gis";
import { MockRouteProvider } from "./mock";
import {
  configuredFallbackRouteProviderKind,
  configuredRouteProviderKind,
  type RouteProvider,
  type RouteProviderKind,
} from "./route-provider";

function construct(kind: RouteProviderKind): RouteProvider {
  if (kind === "google_maps") return new GoogleMapsRouteProvider();
  if (kind === "two_gis") return new TwoGisRouteProvider();
  return new MockRouteProvider();
}

export function getJolchuRouteProvider(): RouteProvider {
  return construct(configuredRouteProviderKind());
}

export function getJolchuFallbackRouteProvider(): RouteProvider | null {
  const kind = configuredFallbackRouteProviderKind();
  return kind ? construct(kind) : null;
}

/** Always available, used only as the last-resort rung of the fallback
 * chain so a request never crashes even if both configured providers fail. */
export function getJolchuMockRouteProvider(): RouteProvider {
  return new MockRouteProvider();
}
