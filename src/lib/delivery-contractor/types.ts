import type { AcquisitionSourceType, BusinessProspect, DeliveryCrmEventType } from "@prisma/client";
import type { MarketRoleClassification } from "@/lib/acquisition/role-classifier";
import type { OutreachOutcome } from "@/lib/acquisition/types";

export interface BusinessSightingInput {
  sourceType: AcquisitionSourceType;
  sourceRef?: string;
  sourceText: string;
  businessName?: string;
  contactPhone?: string;
  contactHandle?: string;
}

export type DeliveryContractorOutcome =
  | { outcome: "SKIPPED_NOT_A_BUSINESS_SIGHTING"; classification: MarketRoleClassification }
  | { outcome: "ALREADY_KNOWN"; prospect: BusinessProspect }
  | { outcome: "PROSPECT_CREATED"; prospect: BusinessProspect; classification: MarketRoleClassification; outreach: OutreachOutcome | null };

export interface RecordDeliveryCrmEventInput {
  businessProspectId: string;
  eventType: DeliveryCrmEventType;
  details?: Record<string, unknown>;
  source: string;
  correctsEventId?: string;
  idempotencyKey: string;
}

export interface RecordDeliveryCrmEventOutcome {
  eventId: string;
  deduplicated: boolean;
}
