// ArturReasoningProvider — the swappable abstraction Artur's report builders
// talk to instead of any concrete AI SDK (AGENTS Master Architecture spec
// s.32: "isolate the provider SDK behind an interface... allow safe future
// migration"). Mirrors src/lib/mira/providers/model-provider.ts exactly.
//
// Per spec s.32/s.34, this layer performs synthesis / analysis /
// prioritization / summarization / proposal-generation ONLY — it never
// decides counts, severities, ownership, idempotency, or scheduling; those
// are all pure/deterministic (snapshot.ts, severity.ts, period.ts) and are
// only ever *handed to* this layer as already-computed ground truth.
import type { ManagerReportSnapshot, KpiRow, ProblemOfTheWeek, WeeklyInitiative } from "../types";
import { MockArturReasoningProvider } from "./mock";
import { ClaudeArturReasoningProvider } from "./claude";

export interface DailyNarrativeInput {
  snapshot: ManagerReportSnapshot;
  previousSnapshot: ManagerReportSnapshot | null;
  openIncidentCount: number;
  stuckCasesCount: number;
}

export interface DailyNarrativeOutput {
  keyEvents: string[];
  passengerSummary: string;
  cargoSummary: string;
  financeSummary: string;
  complaintsSummary: string;
  risksToday: string[];
}

export interface WeeklyAnalysisInput {
  currentSnapshot: ManagerReportSnapshot;
  previousSnapshot: ManagerReportSnapshot | null;
  kpis: KpiRow[];
  recentInitiativeTitles: string[];
}

export interface WeeklyAnalysisOutput {
  executiveSummary: string;
  problems: ProblemOfTheWeek[];
  /** Not guaranteed to be exactly 3 by the provider — initiatives.ts is the
   * layer that enforces/repairs the exactly-3 invariant (spec s.15/s.35). */
  initiatives: WeeklyInitiative[];
}

export interface ArturReasoningProvider {
  readonly providerName: string;
  readonly modelId: string;
  draftDailyNarrative(input: DailyNarrativeInput): Promise<DailyNarrativeOutput>;
  draftWeeklyAnalysis(input: WeeklyAnalysisInput): Promise<WeeklyAnalysisOutput>;
}

export type ArturProviderKind = "anthropic" | "mock";

export interface ArturProviderStatus {
  configuredProvider: ArturProviderKind;
  modelId: string;
  ready: boolean;
  reason: string | null;
}

function configuredProviderKind(): ArturProviderKind {
  const raw = (process.env.ARTUR_AI_PROVIDER ?? "mock").toLowerCase();
  return raw === "anthropic" ? "anthropic" : "mock";
}

/** Never throws, never makes a network call — safe to read from the
 * dispatcher UI at any time. */
export function getArturProviderStatus(): ArturProviderStatus {
  const kind = configuredProviderKind();
  const modelId = process.env.ARTUR_CLAUDE_MODEL ?? "claude-sonnet-5";

  if (kind === "mock") {
    return { configuredProvider: "mock", modelId: "mock-deterministic", ready: true, reason: null };
  }

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    configuredProvider: "anthropic",
    modelId,
    ready: hasKey,
    reason: hasKey ? null : "ANTHROPIC_API_KEY is not set",
  };
}

let cachedProvider: ArturReasoningProvider | null = null;
let cachedProviderKind: ArturProviderKind | null = null;

/** Lazily constructs and caches the configured provider. Construction never
 * touches credentials — only a method call does — so importing this module
 * without ANTHROPIC_API_KEY set never crashes a build or dev server. */
export function getArturReasoningProvider(): ArturReasoningProvider {
  const kind = configuredProviderKind();
  if (cachedProvider && cachedProviderKind === kind) return cachedProvider;

  cachedProvider = kind === "mock" ? new MockArturReasoningProvider() : new ClaudeArturReasoningProvider();
  cachedProviderKind = kind;
  return cachedProvider;
}

/** Test-only escape hatch to reset the cached singleton between provider-kind changes. */
export function _resetArturReasoningProviderCacheForTests() {
  cachedProvider = null;
  cachedProviderKind = null;
}
