// Deliberately-failing provider doubles, used only by the benchmark suite to
// exercise Jolchu's fallback-chain and provider-outage paths deterministically
// (Google down -> 2GIS fallback, both down -> ROUTE_PROVIDER_UNAVAILABLE,
// model provider down -> mock model fallback) without needing real API keys
// or network access. Never used by any production code path.
import type { JolchuModelProvider, JolchuUnderstandInput, JolchuUnderstandOutput } from "../providers/model-provider";
import type { GeocodeCandidate, RouteProvider, RouteProviderCalcInput, RouteProviderCalcResult } from "../route-providers/route-provider";

export class FailingRouteProvider implements RouteProvider {
  constructor(readonly providerName: string) {}

  async geocode(_query: string): Promise<GeocodeCandidate[]> {
    throw new Error(`${this.providerName}_unavailable`);
  }

  async calculateRoute(_input: RouteProviderCalcInput): Promise<RouteProviderCalcResult> {
    throw new Error(`${this.providerName}_unavailable`);
  }
}

export class FailingJolchuModelProvider implements JolchuModelProvider {
  readonly providerName = "failing-model";
  readonly modelId = "unavailable";

  async understand(_input: JolchuUnderstandInput): Promise<JolchuUnderstandOutput> {
    throw new Error("model_provider_unavailable");
  }
}
