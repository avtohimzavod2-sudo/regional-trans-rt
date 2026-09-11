// CARGO_CARRIER_CONTRACTOR's own types (Contragent #4, master spec s.6).
// Its own CargoCarrierProspect model — never Driver/ScoutCandidate/
// DeliveryExecutorProspect. Capability fields (vehicle/capacity/temperature/
// route/backhaul) are captured as unverified prospect CLAIMS only — never
// auto-converted into trusted PartnerRegistry TransportAsset facts (spec
// s.6); CARGO_OPERATIONS is a namespace/department string handoff target,
// never a new named agent this module invents.
import type { AcquisitionSourceType, CargoCarrierProspect } from "@prisma/client";
import type { MarketRoleClassification } from "@/lib/acquisition/role-classifier";
import type { OutreachOutcome } from "@/lib/acquisition/types";
import type { CreateProspectHandoffResult } from "@/lib/prospecting/handoff";

// PUBLIC_AD is a business-advertisement-only source (see BusinessProspect) —
// a cargo-carrier sighting never comes from that channel.
export type CargoCarrierSightingSourceType = Exclude<AcquisitionSourceType, "PUBLIC_AD">;

export interface CargoCarrierSightingInput {
  sourceType: CargoCarrierSightingSourceType;
  sourceGroupId?: string;
  /** Free-form pointer back to the exact post/message (for outreach source traceability). */
  sourceRef?: string;
  sourceText: string;
  rawPhone?: string;
  rawTelegramUsername?: string;
  rawVehicleText?: string;
  rawCapacityText?: string;
  rawRouteText?: string;
  rawTemperatureCapability?: boolean;
  rawBackhaulText?: string;
}

export type CargoCarrierContractorOutcome =
  | { outcome: "SKIPPED_NOT_A_CARGO_CARRIER_SIGHTING"; classification: MarketRoleClassification }
  | { outcome: "ALREADY_KNOWN"; prospect: CargoCarrierProspect }
  | { outcome: "PROSPECT_CREATED"; prospect: CargoCarrierProspect; classification: MarketRoleClassification; outreach: OutreachOutcome | null };

export type CargoCarrierHandoffOutcome = CreateProspectHandoffResult & { prospect: CargoCarrierProspect };
