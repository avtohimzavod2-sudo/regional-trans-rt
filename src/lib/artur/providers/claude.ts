// ClaudeArturReasoningProvider — the production Artur reasoning model,
// backed by Claude via the Vercel AI SDK. Mirrors the generateObject pattern
// in src/lib/mira/providers/google-gemini.ts. Reads ANTHROPIC_API_KEY
// lazily (matches this repo's lazy-env convention) so importing/
// constructing this class never throws — only an actual call does, with a
// clear error the caller can catch and fall back to the mock provider on.
//
// Per spec s.32: this class performs synthesis/analysis/prioritization/
// summarization/proposal-generation only. It never assigns severity
// (severity.ts already did that before this is called), never invents
// counts (snapshot.ts already computed those), and its output is always
// re-validated by zod schemas in ../types.ts before use.
import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { problemOfTheWeekSchema, weeklyInitiativeSchema } from "../types";
import type {
  ArturReasoningProvider,
  DailyNarrativeInput,
  DailyNarrativeOutput,
  WeeklyAnalysisInput,
  WeeklyAnalysisOutput,
} from "./model-provider";

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — ClaudeArturReasoningProvider cannot make live calls. " +
        "Set ARTUR_AI_PROVIDER=mock for a credential-free provider.",
    );
  }
  return key;
}

function modelId(): string {
  return process.env.ARTUR_CLAUDE_MODEL ?? "claude-sonnet-5";
}

const SYSTEM_INSTRUCTIONS = [
  "You are ARTUR, the Director-level AI of Regional Trans RT (RT).",
  "You observe, synthesize, and prioritize — you never invent facts, counts, or severities.",
  "Every number given to you is already verified ground truth from RT Core; use it, never alter it.",
  "Distinguish FACT from ASSUMPTION, and CONFIRMED CAUSE from HYPOTHESIS, explicitly.",
  "Be concise in daily output, analytical in weekly output. Never manufacture bureaucracy:",
  "if a section is genuinely normal, say so briefly instead of inventing content.",
  "You never recommend bypassing Tyyin's inbound-only treasury boundary, Sapargul's payment-confirmation",
  "authority, or Adilet's independent arbitration authority — you may only recommend within your own",
  "Director-level advisory role.",
].join(" ");

const dailyNarrativeSchema = z.object({
  keyEvents: z.array(z.string()),
  passengerSummary: z.string(),
  cargoSummary: z.string(),
  financeSummary: z.string(),
  complaintsSummary: z.string(),
  risksToday: z.array(z.string()),
});

const weeklyAnalysisSchema = z.object({
  executiveSummary: z.string(),
  problems: z.array(problemOfTheWeekSchema),
  initiatives: z.array(weeklyInitiativeSchema).length(3),
});

export class ClaudeArturReasoningProvider implements ArturReasoningProvider {
  readonly providerName = "anthropic";
  get modelId(): string {
    return modelId();
  }

  private client() {
    return createAnthropic({ apiKey: requireApiKey() });
  }

  async draftDailyNarrative(input: DailyNarrativeInput): Promise<DailyNarrativeOutput> {
    const anthropic = this.client();
    const { object } = await generateObject({
      model: anthropic(modelId()),
      schema: dailyNarrativeSchema,
      system: SYSTEM_INSTRUCTIONS,
      prompt: [
        "Draft the narrative portions of today's Founder Daily Brief from this verified snapshot.",
        `Current period snapshot: ${JSON.stringify(input.snapshot)}`,
        `Previous period snapshot: ${input.previousSnapshot ? JSON.stringify(input.previousSnapshot) : "not available"}`,
        `Open emergency incidents: ${input.openIncidentCount}`,
        `Stuck cases (past normal handling time): ${input.stuckCasesCount}`,
        "Produce short, concrete sentences. Do not repeat the raw numbers verbatim if a short summary reads better,",
        "but never contradict them.",
      ].join("\n"),
    });
    return object;
  }

  async draftWeeklyAnalysis(input: WeeklyAnalysisInput): Promise<WeeklyAnalysisOutput> {
    const anthropic = this.client();
    const { object } = await generateObject({
      model: anthropic(modelId()),
      schema: weeklyAnalysisSchema,
      system: SYSTEM_INSTRUCTIONS,
      prompt: [
        "Produce this week's Director Report analysis from this verified data. You MUST propose exactly 3",
        "initiatives — not 2, not 4 — each addressing a real signal in the data below. Do not repeat any of",
        "these already-proposed initiative titles unless you explicitly justify the repetition in the proposal text:",
        JSON.stringify(input.recentInitiativeTitles),
        `Current week snapshot: ${JSON.stringify(input.currentSnapshot)}`,
        `Previous week snapshot: ${input.previousSnapshot ? JSON.stringify(input.previousSnapshot) : "not available"}`,
        `Week-over-week KPI rows: ${JSON.stringify(input.kpis)}`,
        "For each problem, separate CONFIRMED CAUSE from HYPOTHESIS — never invent causation without evidence.",
      ].join("\n"),
    });
    return object;
  }
}
