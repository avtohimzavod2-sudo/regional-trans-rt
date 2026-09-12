// Extraction provider factory. Mirrors src/lib/mira/providers/model-provider.ts
// deliberately — same env-var shape, same lazy singleton, same test reset —
// so there is one thing to learn about providers in this codebase rather than
// one per agent.
//
// The default is the deterministic provider, which is a change from the
// hard-wired Anthropic call this replaces. It matches every other provider
// here (MIRA_AI_PROVIDER, JOLCHU_MODEL_PROVIDER, ARTUR_AI_PROVIDER all default
// to mock) and it fails closed on spend: reaching a paid model now takes an
// explicit RT_NLP_PROVIDER=anthropic, not merely an API key that happens to be
// in the environment.
import { AnthropicTripExtractionProvider } from "./anthropic";
import { RuleBasedTripExtractionProvider } from "./rule-based";
import type { TripExtractionProvider } from "./types";

export type TripExtractionProviderKind = "anthropic" | "rule-based";

export interface TripExtractionProviderStatus {
  configuredProvider: TripExtractionProviderKind;
  modelId: string;
  ready: boolean;
  reason: string | null;
}

function configuredKind(): TripExtractionProviderKind {
  const raw = (process.env.RT_NLP_PROVIDER ?? "rule-based").toLowerCase();
  return raw === "anthropic" ? "anthropic" : "rule-based";
}

/** Never throws, never makes a network call. */
export function getTripExtractionProviderStatus(): TripExtractionProviderStatus {
  const kind = configuredKind();
  if (kind === "rule-based") {
    return { configuredProvider: kind, modelId: "rule-based-deterministic", ready: true, reason: null };
  }

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    configuredProvider: kind,
    modelId: "claude-sonnet-5",
    ready: hasKey,
    reason: hasKey ? null : "ANTHROPIC_API_KEY is not set",
  };
}

let cached: TripExtractionProvider | null = null;
let cachedKind: TripExtractionProviderKind | null = null;

export function getTripExtractionProvider(): TripExtractionProvider {
  const kind = configuredKind();
  if (cached && cachedKind === kind) return cached;

  cached = kind === "anthropic" ? new AnthropicTripExtractionProvider() : new RuleBasedTripExtractionProvider();
  cachedKind = kind;
  return cached;
}

/** Test-only escape hatch to reset the cached singleton between provider-kind changes. */
export function _resetTripExtractionProviderCacheForTests() {
  cached = null;
  cachedKind = null;
}
