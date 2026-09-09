import type { AcquisitionSourceType, PassengerProspect } from "@prisma/client";
import type { MarketRoleClassification } from "@/lib/acquisition/role-classifier";
import type { OutreachOutcome } from "@/lib/acquisition/types";
import type { MarketGapResult } from "@/lib/rt-office/market-gap";

// PUBLIC_AD is business-advertisement-only sourcing (see BusinessProspect) —
// a passenger sighting never comes from that channel.
export type PassengerSightingSourceType = Exclude<AcquisitionSourceType, "PUBLIC_AD">;

export interface PassengerSightingInput {
  sourceType: PassengerSightingSourceType;
  sourceGroupId?: string;
  sourceRef?: string;
  sourceText: string;
  rawPhone?: string;
  rawTelegramUsername?: string;
  rawRouteText?: string;
  rawOriginStopId?: string;
  rawDestinationStopId?: string;
  rawTravelDate?: Date;
  /** Scopes the Market Gap read that decides whether outreach fires. */
  corridorId?: string;
}

export type PassengerContractorOutcome =
  | { outcome: "SKIPPED_NOT_A_PASSENGER_SIGHTING"; classification: MarketRoleClassification }
  | { outcome: "ALREADY_KNOWN"; prospect: PassengerProspect }
  | {
      outcome: "PROSPECT_CREATED";
      prospect: PassengerProspect;
      classification: MarketRoleClassification;
      marketGap: MarketGapResult;
      outreach: OutreachOutcome | null;
    };
