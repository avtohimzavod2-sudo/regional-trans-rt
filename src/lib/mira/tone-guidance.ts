// Deterministic tone-guidance builder (Mira Professional Communication Pass
// s.6). Produces a short, English, model-facing instruction describing HOW
// Mira should say something this turn — it never states WHAT is true (that
// stays situationForOutcome's job in reply-templates.ts). Built only from
// context the orchestrator has already computed/verified for this turn
// (outcome, clarification need, route-coverage-gap status, the live
// driver-shortage signal from propositions.ts) — this module runs no
// detection of its own and never invents a situation (e.g. no frustration or
// tourist-mode signal, because no such detector exists yet in this
// codebase). Pure, deterministic, no I/O — mirrors situationForOutcome in
// shape and trust boundary.
import type { Language } from "@prisma/client";
import type { CommandResult } from "@/lib/agents/command";

export interface ToneGuidanceContext {
  language: Language;
  outcome: CommandResult["outcome"];
  requiresClarification: boolean;
  isRouteCoverageGap: boolean;
  hasDriverShortageSignal: boolean;
}

const BASE_REGISTER =
  'Calm, warm, concise mobile-chat register (Mira Service Constitution A-C/G-I). Never blame the passenger, driver, another RT agent, or "the system". Acknowledge inconvenience once, without over-apologizing.';

// Spec s.8-10 — a standing rule whenever Mira is speaking Kyrgyz, not tied to
// any particular situation below.
const KY_REGISTER_NOTE =
  ' Speaking to a Kyrgyz speaker: respond naturally, never ask them to "write correctly", never force literary Kyrgyz, never translate word-for-word from Russian, and avoid bureaucratic/government-style phrasing.';

function situationalGuidance(ctx: ToneGuidanceContext): string {
  if (ctx.outcome === "cancellation_case_opened") {
    return "The cancellation is already confirmed and complete. State it plainly and calmly — no theatrics, no extra hedging.";
  }
  if (ctx.isRouteCoverageGap) {
    return "RT genuinely doesn't operate this route yet. Say so honestly and matter-of-factly — this is not a failure to understand the customer, so don't sound unsure or apologetic about having misunderstood.";
  }
  if (ctx.requiresClarification) {
    return "Ask for only the missing information, in one focused question. Do not re-ask anything already provided, and do not turn this into a checklist.";
  }
  if (ctx.outcome === "trip_request_created" || ctx.outcome === "driver_offer_created") {
    return ctx.hasDriverShortageSignal
      ? "This is a confirmed success. Demand is genuinely high right now, so a brief, honest note of encouragement fits alongside the confirmation."
      : "This is a confirmed success. Be warm and give a clear sense of what happens next.";
  }
  return "Nothing unusual here — a short, natural acknowledgment is enough.";
}

/** Builds the model-facing tone instruction for one reply. Always returns
 * non-empty text so toneGuidance is genuinely used on every live provider
 * call, not left wired-but-empty for the common case. */
export function buildToneGuidance(ctx: ToneGuidanceContext): string {
  const register = ctx.language === "KY" ? `${BASE_REGISTER}${KY_REGISTER_NOTE}` : BASE_REGISTER;
  return `${register} ${situationalGuidance(ctx)}`;
}
