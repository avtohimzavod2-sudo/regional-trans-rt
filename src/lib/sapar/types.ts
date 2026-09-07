// Dependency-free Sapar domain types — no db/provider imports, so this file
// stays trivially unit-testable. Mirrors src/lib/jolchu/types.ts's role in
// that module: the shared vocabulary every other Sapar file imports from.
import type {
  DeliveryExecutorSource,
  DeliveryExecutorVerification,
  Language,
  ShipmentIncidentSeverity,
  ShipmentLegKind,
  ShipmentQuoteSource,
  ShipmentRiskLevel,
  ShipmentStatus,
} from "@prisma/client";

/** What the deterministic extractor pulls out of raw customer text. Every
 * field is optional — Sapar must never invent a value it didn't actually
 * find (AGENTS spec s.40). */
export interface ShipmentExtraction {
  pickupText: string | null;
  destinationText: string | null;
  cargoDescription: string | null;
  pieces: number | null;
  weightKg: number | null;
  dimensions: string | null;
  preferredPickupTime: string | null;
  declaredValueSom: number | null;
  fragile: boolean;
  perishable: boolean;
  temperatureControlled: boolean;
  specialHandling: string | null;
}

export const REQUIRED_SHIPMENT_FIELDS = ["pickupText", "destinationText", "cargoDescription"] as const;
export type RequiredShipmentField = (typeof REQUIRED_SHIPMENT_FIELDS)[number];

export type SaparRiskAction = "ALLOW" | "ESCALATE" | "BLOCK";

export interface RiskDecision {
  level: ShipmentRiskLevel;
  action: SaparRiskAction;
  flags: string[];
  reason: string | null;
}

export interface SaparRoutingDecision {
  required: boolean;
  matchedSignal: string | null;
}

export const QUOTE_RANK_REASONS = [
  "DIRECT_ROUTE",
  "HIGH_RELIABILITY",
  "LOW_PRICE",
  "FAST_PICKUP",
  "DOOR_TO_DOOR",
  "FEWER_HANDOFFS",
  "VERIFIED_PARTNER",
  "PROVISIONAL_PARTNER",
  "UNVERIFIED_PENALTY",
  "NEW_EXECUTOR_UNCERTAIN",
] as const;
export type QuoteRankReason = (typeof QUOTE_RANK_REASONS)[number];

/** A single candidate delivery plan produced by the matching engine, before
 * it is persisted as a ShipmentQuote row. */
export interface QuoteCandidate {
  providerCode: string;
  executorId: string | null;
  executorSource: DeliveryExecutorSource | null;
  executorReliabilityScore: number | null; // null = no observations yet (new executor), not "bad"
  // null only for the no-executor-bound internal estimate candidate; a real
  // bound executor always carries its trust tier so ranking can never let an
  // UNVERIFIED executor win purely on price (AGENTS hardening spec s.10/s.11).
  executorVerification: DeliveryExecutorVerification | null;
  priceSom: number | null;
  priceSource: ShipmentQuoteSource;
  currency: "KGS";
  estimatedPickupAt: Date | null;
  estimatedDeliveryAt: Date | null;
  serviceType: string;
  doorToDoor: boolean;
  lastMileIncluded: boolean;
  confidence: number; // confidence in the price/ETA estimate itself, 0..1
  rankScore: number;
  rankReasons: QuoteRankReason[];
  legKinds: ShipmentLegKind[];
}

export interface SaparResult {
  shipmentId: string;
  publicId: string;
  status: ShipmentStatus;
  language: Language;
  missingFields: RequiredShipmentField[];
  risk: RiskDecision;
  recommendedQuote: {
    priceSom: number | null;
    priceSource: ShipmentQuoteSource;
    estimatedPickupAt: Date | null;
    estimatedDeliveryAt: Date | null;
    // Whether this price came from the sandbox mock provider rather than a
    // real/confirmed source — the reply composer must never phrase a mock
    // price as a firm, official quote (AGENTS hardening spec s.7).
    isMockPricing: boolean;
  } | null;
  assignedExecutorName: string | null;
  incidentOpened: boolean;
  // Present only right after a customer confirms a priced quote — the
  // Payment Gate's outbound face for Mira (AGENTS Sapargul spec s.9/s.16).
  // null means either no payment step applies yet, or a destination/price
  // isn't available (an incident is opened in that case; never fabricated).
  paymentInstructions: {
    orderReference: string;
    amountSom: number;
    currency: string;
    destinationLabel: string | null;
    destinationMethod: string | null;
    instructionsText: string | null;
    isSandbox: boolean;
  } | null;
}

/** What a candidate executor must be able to handle for a given shipment —
 * used to exclude incompatible executors before ranking even runs (AGENTS
 * hardening spec s.9). */
export interface ShipmentCargoRequirements {
  weightKg: number | null;
  pieces: number | null;
  fragile: boolean;
  perishable: boolean;
  temperatureControlled: boolean;
}

export interface ShipmentIncidentInput {
  shipmentId: string;
  legId?: string | null;
  type: string;
  severity: ShipmentIncidentSeverity;
  description?: string | null;
}
