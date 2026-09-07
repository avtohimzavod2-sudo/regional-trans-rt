// Dependency-free Sapar domain types — no db/provider imports, so this file
// stays trivially unit-testable. Mirrors src/lib/jolchu/types.ts's role in
// that module: the shared vocabulary every other Sapar file imports from.
import type {
  DeliveryExecutorSource,
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
  executorVerified: boolean;
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
  } | null;
  assignedExecutorName: string | null;
  incidentOpened: boolean;
}

export interface ShipmentIncidentInput {
  shipmentId: string;
  legId?: string | null;
  type: string;
  severity: ShipmentIncidentSeverity;
  description?: string | null;
}
