// Read-only, bounded value propositions Mira may add to a reply. The only
// source of truth here is RT OFFICE's existing live Market Gap
// (rt-office/market-gap.ts) — this module never computes its own
// demand/supply number and never invents one (same "no invented market
// numbers" discipline the Driver/Passenger Contractors follow). A
// proposition is always additive to the real, fact-based reply Mira already
// composed for the turn, never a replacement for it, and it is Mira herself
// who sends it — this module only produces text, never a message.
import type { Language } from "@prisma/client";
import { computeMarketGap, type MarketGapPriority } from "@/lib/rt-office/market-gap";

const DRIVER_DEMAND_PROPOSITION: Record<Language, string> = {
  KY: "Азыр биздин платформада ушул багытта жүргүнчүлөр көп — сиз үчүн жакшы убакыт!",
  RU: "Сейчас на платформе много пассажиров, ищущих поездку — хорошее время водить с нами.",
  EN: "There's real passenger demand on our platform right now — a good time to be driving with RT.",
};

export interface DriverDemandProposition {
  text: string;
  priority: MarketGapPriority;
  gapSeats: number;
}

/** Only ever returns a sentence when the live Market Gap genuinely shows a
 * driver shortage right now (HIGH_DRIVER_ACQUISITION_NEED); returns null in
 * every other case rather than a generic filler line. Meant to be called
 * once, right after a driver's offer is created, so the encouragement is
 * tied to a fact that was true at that moment. */
export async function driverDemandProposition(language: Language): Promise<DriverDemandProposition | null> {
  const gap = await computeMarketGap();
  if (gap.priority !== "HIGH_DRIVER_ACQUISITION_NEED") return null;
  return { text: DRIVER_DEMAND_PROPOSITION[language], priority: gap.priority, gapSeats: gap.gapSeats };
}
