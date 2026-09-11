// DELIVERY_EXECUTOR_CONTRACTOR's own types (Contragent #3, master spec s.5).
// Deliberately its own DeliveryExecutorProspect model rather than reuse of
// ScoutCandidate/Driver — a courier/light-van/taxi-driver willing to carry
// parcels is a distinct supply pool from PASSENGER-network seat supply, and
// spec s.5 explicitly forbids reusing Driver/ScoutCandidate here.
import type { AcquisitionSourceType, DeliveryExecutorProspect } from "@prisma/client";
import type { MarketRoleClassification } from "@/lib/acquisition/role-classifier";
import type { OutreachOutcome } from "@/lib/acquisition/types";
import type { CreateProspectHandoffResult } from "@/lib/prospecting/handoff";

// PUBLIC_AD is a business-advertisement-only source (see BusinessProspect) —
// a delivery-executor sighting never comes from that channel.
export type DeliveryExecutorSightingSourceType = Exclude<AcquisitionSourceType, "PUBLIC_AD">;

export interface DeliveryExecutorSightingInput {
  sourceType: DeliveryExecutorSightingSourceType;
  sourceGroupId?: string;
  /** Free-form pointer back to the exact post/message (for outreach source traceability). */
  sourceRef?: string;
  sourceText: string;
  rawPhone?: string;
  rawTelegramUsername?: string;
  rawVehicleText?: string;
  rawZonesText?: string;
}

export type DeliveryExecutorContractorOutcome =
  | { outcome: "SKIPPED_NOT_A_DELIVERY_EXECUTOR_SIGHTING"; classification: MarketRoleClassification }
  | { outcome: "ALREADY_KNOWN"; prospect: DeliveryExecutorProspect }
  | { outcome: "PROSPECT_CREATED"; prospect: DeliveryExecutorProspect; classification: MarketRoleClassification; outreach: OutreachOutcome | null };

export type DeliveryExecutorHandoffOutcome = CreateProspectHandoffResult & { prospect: DeliveryExecutorProspect };
