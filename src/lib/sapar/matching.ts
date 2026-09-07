// Sapar's matching/scoring engine (AGENTS spec s.6/s.41). Deterministic,
// explainable weighted scoring — no ML required at this stage. Pure and
// DB-free so ranking stays unit-testable on its own; callers (orchestrator)
// are responsible for building the raw candidate list from the provider
// abstraction and the executor directory.
import type { QuoteCandidate, QuoteRankReason } from "./types";

const RELIABILITY_WEIGHT = 40;
const PRICE_WEIGHT = 30;
const DOOR_TO_DOOR_WEIGHT = 10;
const LAST_MILE_WEIGHT = 5;
const VERIFIED_WEIGHT = 10;
const CONFIDENCE_WEIGHT = 5;

// Trust-tier adjustment (AGENTS hardening spec s.10/s.11): a Telegram/
// WhatsApp group contact is a signal source, not an automatically "verified
// partner" — an UNVERIFIED executor must never win purely on being cheaper
// than a VERIFIED one. The penalty is deliberately larger than the full
// VERIFIED bonus so a small price edge alone can never flip the outcome
// against a verified, reliable candidate (the spec's own worked example:
// verified @ 700 som / reliability 0.95 must beat unverified @ 600 som /
// unknown reliability). No bound executor (the internal-estimate candidate)
// gets no adjustment either way.
const PROVISIONAL_WEIGHT = VERIFIED_WEIGHT / 2;
const UNVERIFIED_PENALTY = 15;

const HIGH_RELIABILITY_THRESHOLD = 0.8;
// A brand-new executor isn't treated as unreliable, but its uncertainty
// isn't ignored either — it's scored at a neutral midpoint (AGENTS spec s.18).
const NEUTRAL_RELIABILITY_FOR_NEW_EXECUTOR = 0.5;

function priceScoreOf(priceSom: number | null, minPrice: number | null, maxPrice: number | null): number {
  if (priceSom === null || minPrice === null || maxPrice === null) return 0.5;
  if (maxPrice === minPrice) return 1;
  return 1 - (priceSom - minPrice) / (maxPrice - minPrice);
}

/** Ranks a set of already-built quote candidates for the same shipment,
 * attaching a transparent rankScore and the specific reasons behind it.
 * Returns candidates sorted best-first; the caller decides how many to
 * show/persist (AGENTS spec s.7/s.12: don't overwhelm the client with
 * options — Sapar can just recommend the best one). */
export function rankQuoteCandidates(candidates: QuoteCandidate[]): QuoteCandidate[] {
  if (candidates.length === 0) return [];

  const prices = candidates.map((c) => c.priceSom).filter((p): p is number => p !== null);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  const legCounts = candidates.map((c) => c.legKinds.length);
  const minLegCount = Math.min(...legCounts);

  const pickupTimes = candidates.map((c) => c.estimatedPickupAt?.getTime() ?? null).filter((t): t is number => t !== null);
  const earliestPickup = pickupTimes.length > 0 ? Math.min(...pickupTimes) : null;

  const scored = candidates.map((c): QuoteCandidate => {
    const reasons = new Set<QuoteRankReason>();

    const reliabilityForScoring = c.executorReliabilityScore ?? NEUTRAL_RELIABILITY_FOR_NEW_EXECUTOR;
    const priceScore = priceScoreOf(c.priceSom, minPrice, maxPrice);
    const trustAdjustment =
      c.executorVerification === "VERIFIED"
        ? VERIFIED_WEIGHT
        : c.executorVerification === "PROVISIONAL"
          ? PROVISIONAL_WEIGHT
          : c.executorVerification === "UNVERIFIED"
            ? -UNVERIFIED_PENALTY
            : 0;

    const rankScore =
      reliabilityForScoring * RELIABILITY_WEIGHT +
      priceScore * PRICE_WEIGHT +
      (c.doorToDoor ? DOOR_TO_DOOR_WEIGHT : 0) +
      (c.lastMileIncluded ? LAST_MILE_WEIGHT : 0) +
      trustAdjustment +
      c.confidence * CONFIDENCE_WEIGHT;

    if (c.executorReliabilityScore === null && c.executorId !== null) reasons.add("NEW_EXECUTOR_UNCERTAIN");
    if (reliabilityForScoring >= HIGH_RELIABILITY_THRESHOLD) reasons.add("HIGH_RELIABILITY");
    if (c.priceSom !== null && c.priceSom === minPrice) reasons.add("LOW_PRICE");
    if (c.doorToDoor) reasons.add("DOOR_TO_DOOR");
    if (c.executorVerification === "VERIFIED") reasons.add("VERIFIED_PARTNER");
    if (c.executorVerification === "PROVISIONAL") reasons.add("PROVISIONAL_PARTNER");
    if (c.executorVerification === "UNVERIFIED") reasons.add("UNVERIFIED_PENALTY");
    if (!c.legKinds.includes("TRANSFER")) reasons.add("DIRECT_ROUTE");
    if (c.legKinds.length === minLegCount) reasons.add("FEWER_HANDOFFS");
    if (earliestPickup !== null && c.estimatedPickupAt?.getTime() === earliestPickup) reasons.add("FAST_PICKUP");

    return { ...c, rankScore, rankReasons: Array.from(reasons) };
  });

  return scored.sort((a, b) => b.rankScore - a.rankScore);
}
