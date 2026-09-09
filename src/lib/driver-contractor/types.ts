// DRIVER_CONTRACTOR's own types. Deliberately thin — the two things it
// produces (a ScoutCandidate row, an AcquisitionOutreachEvent row) are both
// owned and typed by the modules it reuses (SCOUT, acquisition/outreach-log).
import type { AcquisitionSourceType } from "@prisma/client";
import type { MarketRoleClassification } from "@/lib/acquisition/role-classifier";
import type { OutreachOutcome } from "@/lib/acquisition/types";
import type { MarketGapResult } from "@/lib/rt-office/market-gap";

// PUBLIC_AD is a business-advertisement-only source (see BusinessProspect) —
// a driver sighting never comes from that channel, so it's excluded here
// rather than handled with a silent fallback in the source-type mapping.
export type DriverSightingSourceType = Exclude<AcquisitionSourceType, "PUBLIC_AD">;

export interface DriverSightingInput {
  sourceType: DriverSightingSourceType;
  sourceGroupId?: string;
  /** Free-form pointer back to the exact post/message (for outreach source traceability). */
  sourceRef?: string;
  sourceText: string;
  rawPhone?: string;
  rawTelegramUsername?: string;
  rawCarModel?: string;
  rawCarPlate?: string;
  rawRouteText?: string;
  rawOriginStopId?: string;
  rawDestinationStopId?: string;
  rawTravelDate?: Date;
  /** Scopes the Market Gap read that decides whether outreach fires. */
  corridorId?: string;
}

export type DriverContractorOutcome =
  | { outcome: "SKIPPED_NOT_A_DRIVER_SIGHTING"; classification: MarketRoleClassification }
  | {
      outcome: "IMPORTED";
      scoutCandidateId: string;
      classification: MarketRoleClassification;
      marketGap: MarketGapResult;
      outreach: OutreachOutcome | null;
    };
