// JolchuModelProvider — the swappable LLM abstraction for Jolchu's language
// understanding ONLY (parsing landmarks, resolving ambiguity phrasing,
// preparing a geocode query, interpreting a provider result back into
// natural language). It must NEVER be asked for — and must never return —
// coordinates, kilometers, duration, or traffic: those come exclusively from
// a RouteProvider (see ../route-providers/route-provider.ts). Business logic
// (resolver, route calculation, orchestrator) must depend only on this
// interface, never on "@ai-sdk/google" or any concrete SDK directly.
import { MockJolchuModelProvider } from "./mock";
import { GoogleGeminiJolchuProvider } from "./google-gemini";

export interface JolchuUnderstandInput {
  text: string;
  role: "ORIGIN" | "DESTINATION" | "WAYPOINT" | "SINGLE";
  language?: string;
}

export interface JolchuUnderstandOutput {
  /** A cleaned search query to hand to a RouteProvider's geocoder — the
   * model's only real job: turning free-form/landmark speech into something
   * a geocoder can match. Never a coordinate or distance guess. */
  geocodeQuery: string;
  isLandmarkPhrasing: boolean;
  isSettlementOnly: boolean;
  possiblyAmbiguous: boolean;
  notes: string | null;
}

export interface JolchuModelProvider {
  readonly providerName: string;
  readonly modelId: string;
  understand(input: JolchuUnderstandInput): Promise<JolchuUnderstandOutput>;
}

export type JolchuModelProviderKind = "google" | "mock";

export interface JolchuModelProviderStatus {
  configuredProvider: JolchuModelProviderKind;
  modelId: string;
  ready: boolean;
  reason: string | null;
}

function configuredProviderKind(): JolchuModelProviderKind {
  const raw = (process.env.JOLCHU_MODEL_PROVIDER ?? "mock").toLowerCase();
  return raw === "google" ? "google" : "mock";
}

/** Never throws, never makes a network call — safe for Jolchu Center's
 * Providers tab to read at any time. */
export function getJolchuModelProviderStatus(): JolchuModelProviderStatus {
  const kind = configuredProviderKind();
  const modelId = process.env.JOLCHU_PRIMARY_MODEL ?? "gemini-flash-latest";

  if (kind === "mock") {
    return { configuredProvider: "mock", modelId: "mock-deterministic", ready: true, reason: null };
  }

  const hasKey = Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.MIRA_GEMINI_API_KEY);
  return {
    configuredProvider: "google",
    modelId,
    ready: hasKey,
    reason: hasKey ? null : "No Gemini credentials configured for Jolchu",
  };
}

let cachedProvider: JolchuModelProvider | null = null;
let cachedProviderKind: JolchuModelProviderKind | null = null;

/** Lazily constructs and caches the configured PRIMARY model provider.
 * Construction never throws — only an actual call can fail — matching the
 * repo's established lazy-credential convention. */
export function getJolchuModelProvider(): JolchuModelProvider {
  const kind = configuredProviderKind();
  if (cachedProvider && cachedProviderKind === kind) return cachedProvider;

  cachedProvider = kind === "mock" ? new MockJolchuModelProvider() : new GoogleGeminiJolchuProvider();
  cachedProviderKind = kind;
  return cachedProvider;
}

/** Always-available last-resort fallback (the "MOCK_MODEL" concept): if the
 * primary provider throws, callers can degrade to this rather than fail the
 * whole request outright, since Jolchu's LLM layer only prepares a query —
 * a degraded query still lets the RouteProvider attempt a real geocode. */
export function getJolchuFallbackModelProvider(): JolchuModelProvider {
  return new MockJolchuModelProvider();
}

/** Stub for the future cross-provider Model Router described in the RT AI
 * Workforce architecture: selecting a model by latency/cost/availability/
 * Kyrgyz-language quality/task type/complexity/reliability. Today it only
 * has two candidates (mock, google), so selection collapses to "primary,
 * else fallback" — but the seam is here so a real router can replace this
 * body without touching any caller. */
export class JolchuModelRouter {
  selectPrimary(): JolchuModelProvider {
    return getJolchuModelProvider();
  }

  selectFallback(): JolchuModelProvider {
    return getJolchuFallbackModelProvider();
  }
}

export function _resetJolchuModelProviderCacheForTests() {
  cachedProvider = null;
  cachedProviderKind = null;
}
