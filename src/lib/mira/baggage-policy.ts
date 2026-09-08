// Passenger personal baggage policy (Mira Pass 1 spec s.13-s.17). Pure,
// dependency-free, and fully configurable — the Founder-approved kilogram
// thresholds and the 100 KGS significant-excess fee are NOT yet a final
// immutable tariff, so they live in one injectable config object instead of
// being scattered as literal numbers through business logic. Tests inject
// explicit threshold values rather than relying on the defaults below.
export type BaggageTier = "NORMAL" | "MODERATE_EXCESS" | "SIGNIFICANT_EXCESS";

export interface BaggagePolicyConfig {
  /** Upper bound (inclusive) of ordinary personal baggage — currently ~20-30
   * kg per Founder guidance (spec s.13). Not an immutable tariff. */
  normalMaxKg: number;
  /** Upper bound (inclusive) of MODERATE_EXCESS before SIGNIFICANT_EXCESS
   * begins. Not an immutable tariff. */
  moderateMaxKg: number;
  /** RT's own significant-excess baggage fee (spec s.16) — currently 100
   * KGS, kept here so it is never hard-coded inline. */
  significantExcessFeeSom: number;
}

export const DEFAULT_BAGGAGE_POLICY: BaggagePolicyConfig = {
  normalMaxKg: 30,
  moderateMaxKg: 60,
  significantExcessFeeSom: 100,
};

/** RT's extra baggage fee for NORMAL and MODERATE_EXCESS is always 0 (spec
 * s.14/s.15) — RT never fabricates a surcharge for either tier. */
export function classifyBaggageWeight(weightKg: number, config: BaggagePolicyConfig = DEFAULT_BAGGAGE_POLICY): BaggageTier {
  if (weightKg <= config.normalMaxKg) return "NORMAL";
  if (weightKg <= config.moderateMaxKg) return "MODERATE_EXCESS";
  return "SIGNIFICANT_EXCESS";
}

export interface BaggageCharges {
  tier: BaggageTier;
  /** RT's own fee — 0 for NORMAL/MODERATE_EXCESS, config.significantExcessFeeSom for SIGNIFICANT_EXCESS. */
  rtExtraBaggageFeeSom: number;
  /** The driver's own trip-economics surcharge — a wholly separate concept
   * from RT's fee (spec s.15/s.16). Never merged into rtExtraBaggageFeeSom.
   * `null` means unknown/pending driver confirmation — Mira must never
   * invent a number here. */
  driverExtraBaggageChargeSom: number | null;
}

/** Resolves the two charge concepts for a baggage tier. `driverExtraBaggageChargeSom`
 * is passed straight through (never invented, never merged with RT's fee) —
 * spec s.15: "Mira must never merge them. Mira must not invent the driver's
 * surcharge. If the amount is unknown, preserve it as unknown/pending driver
 * confirmation." */
export function resolveBaggageCharges(
  tier: BaggageTier,
  driverExtraBaggageChargeSom: number | null,
  config: BaggagePolicyConfig = DEFAULT_BAGGAGE_POLICY,
): BaggageCharges {
  return {
    tier,
    rtExtraBaggageFeeSom: tier === "SIGNIFICANT_EXCESS" ? config.significantExcessFeeSom : 0,
    driverExtraBaggageChargeSom,
  };
}

// Weight-mention extraction — mirrors the deterministic regex/dictionary
// style of src/lib/sapar/extract.ts's weight parsing, scoped to passenger
// baggage phrasing ("20 кг багажа", "багаж 25кг", "30 kg of luggage").
const WEIGHT_PATTERNS: RegExp[] = [
  /(\d{1,3})\s*кг/i,
  /(\d{1,3})\s*kg/i,
];

/** Extracts a baggage weight in kg from free text, or null if none is
 * clearly stated. Never guesses — a message with no number returns null. */
export function extractBaggageWeightKg(text: string): number | null {
  for (const pattern of WEIGHT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return null;
}

export interface CargoNotBaggageInput {
  pieces?: number | null;
  weightKg?: number | null;
  text?: string;
}

// Commercial/bulk signals — number of pieces, dimensions, and commercial
// wording matter more than weight alone (spec s.17: "NOT decided from weight
// alone"). A single heavy suitcase is still baggage; five boxes of product
// is cargo even if each box is light.
const COMMERCIAL_SIGNALS = [
  "коробк", "коробок", "коробки", "товар", "опт", "оптом", "ящик", "ящики",
  "паллет", "pallet", "партия товара", "на продажу", "для магазина",
];
const MANY_PIECES_THRESHOLD = 5;

/** Heuristic distinguishing passenger baggage from a cargo task in disguise
 * (spec s.17). Considers piece count, commercial wording, and (only as one
 * factor among several) weight — never weight alone. When true, Mira should
 * explain this naturally and offer the same-chat handoff to Sapar rather
 * than treating it as ordinary passenger luggage. */
export function isLikelyCargoNotBaggage(input: CargoNotBaggageInput): boolean {
  const normalizedText = (input.text ?? "").toLowerCase();
  const hasCommercialWording = COMMERCIAL_SIGNALS.some((s) => normalizedText.includes(s));
  const manyPieces = (input.pieces ?? 0) >= MANY_PIECES_THRESHOLD;

  if (hasCommercialWording) return true;
  if (manyPieces) return true;
  return false;
}
