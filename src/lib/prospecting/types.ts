// RT Prospecting Core vocabulary (docs/architecture/prospecting.md, spec
// s.11-s.14, s.20). Dependency-free — no db import — same pattern as
// src/lib/cargo-profile/types.ts.
//
// This is NOT a new prospecting database. `src/lib/acquisition/` already
// implements the real, shared safety-gate/outreach/opt-out infrastructure
// (sendAcquisitionOutreach, isDoNotContact, recordOptOut, outreach-log.ts)
// that all five commercial contragents must use. What's missing there is the
// spec's 5-way ProspectType vocabulary and the ProspectHandoff contract —
// this file adds exactly those two things, nothing else.
//
// `AcquisitionProspectType` (prisma/schema.prisma) only has three values
// today: DRIVER, PASSENGER, BUSINESS — mapping onto spec Contragents #1, #2,
// #5. Contragents #3 (Delivery Executor Acquisition) and #4 (Cargo Carrier
// Acquisition) have no Prisma enum value yet; per spec s.23 ("do not name the
// future Cargo agent", "do not overbuild"), this stage does not add one.
// `ProspectType` below is the full 5-way vocabulary a future
// DELIVERY_EXECUTOR_CONTRACTOR/CARGO_CARRIER_CONTRACTOR pair would use; the
// two Prisma-backed members must stay string-identical to
// `AcquisitionProspectType` so a future migration is a pure additive enum
// extension, never a rename.
import type { Known } from "../cargo-profile/types";

/** The five prospecting contragents from spec s.11, in their numbered order. */
export type ProspectType =
  | "PASSENGER_DEMAND" // Contragent #1 -> handoff target: Mira / Passenger Operations / Akzhol
  | "DRIVER_SUPPLY" // Contragent #2 -> handoff target: RT OFFICE
  | "DELIVERY_EXECUTOR_SUPPLY" // Contragent #3 (no Prisma enum yet) -> handoff target: Sapar / Delivery Operations
  | "CARGO_CARRIER_SUPPLY" // Contragent #4 (no Prisma enum yet) -> handoff target: Cargo Operations
  | "BUSINESS_CUSTOMER"; // Contragent #5 -> handoff target: Zholaman (small delivery) or Cargo Operations (freight)

/** `AcquisitionProspectType` members this ProspectType already has a live
 * Prisma-backed home for. The other three ProspectType values are documented
 * extension points only — see module header. */
export const PROSPECT_TYPES_WITH_EXISTING_SCHEMA_SUPPORT: readonly ProspectType[] = ["PASSENGER_DEMAND", "DRIVER_SUPPLY", "BUSINESS_CUSTOMER"];

export type ProspectStatus = "DISCOVERED" | "QUALIFIED" | "CONTACTED" | "RESPONDED" | "HANDED_OFF" | "OPTED_OUT" | "REJECTED" | "DUPLICATE";

export type HandoffStatus = "READY" | "ACCEPTED" | "REJECTED" | "NEEDS_MORE_INFO" | "DUPLICATE";

/** The shared handoff contract from spec s.14, verbatim field list. A
 * contragent creates one of these the moment a prospect expresses interest —
 * it must never keep leading the operational relationship past that point
 * (spec s.14/s.15). */
export interface ProspectHandoff {
  handoffId: string;
  prospectId: string;
  sourceAgent: string;
  targetAgentOrDepartment: string;
  prospectType: ProspectType;
  expressedInterest: Known<string>;
  summary: Known<string>;
  contactData: Known<string>;
  requestedService: Known<string>;
  availableCapabilities: string[];
  conversationReference: Known<string>;
  sourceReferences: string[];
  createdAt: string;
  status: HandoffStatus;
}

/** Which internal agent/department a given ProspectType hands off to (spec
 * s.11). Passenger and Business demand have more than one plausible target
 * depending on the specific request; the caller picks among these rather than
 * this function guessing at intent. */
export const HANDOFF_TARGETS: Record<ProspectType, readonly string[]> = {
  PASSENGER_DEMAND: ["MIRA", "PASSENGER_OPERATIONS", "AKZHOL"],
  DRIVER_SUPPLY: ["RT_OFFICE"],
  DELIVERY_EXECUTOR_SUPPLY: ["SAPAR", "DELIVERY_OPERATIONS"],
  CARGO_CARRIER_SUPPLY: ["CARGO_OPERATIONS"],
  BUSINESS_CUSTOMER: ["ZHOLAMAN", "SAPAR", "CARGO_OPERATIONS"],
};

/** Opt-out guard (invariant #10): an opted-out prospect must never be
 * considered valid for a new handoff. This checks the handoff-time snapshot
 * only — the authoritative, append-only opt-out record is
 * `isDoNotContact()`/`recordOptOut()` in src/lib/acquisition/outreach-log.ts;
 * this module does not duplicate that store. */
export function canHandoff(prospectStatus: ProspectStatus): boolean {
  return prospectStatus !== "OPTED_OUT" && prospectStatus !== "REJECTED" && prospectStatus !== "DUPLICATE";
}

/** Handoff acceptance is the ownership-transfer moment (spec s.14: "after
 * ACCEPTED, ownership transfers to the internal contour"). Creating a
 * ProspectHandoff never implies acceptance by itself. */
export function isAcceptedHandoff(handoff: Pick<ProspectHandoff, "status">): boolean {
  return handoff.status === "ACCEPTED";
}

/** Reserved domain-event names for future wiring (spec s.20). RT has no
 * central event bus today — every "event" is an AuditLogEntry row read by
 * agentName + details.event (src/lib/agents/trace.ts's logAgentAction). These
 * names are a namespace reservation only: nothing in this repo emits them
 * yet, and no name here duplicates an existing canonical event (checked
 * against the current agent/audit call sites during this task's audit). */
export const PROSPECTING_EVENT_NAMES = [
  "ProspectDiscovered",
  "ProspectQualified",
  "ProspectContacted",
  "ProspectResponded",
  "ProspectOptedOut",
  "ProspectHandoffCreated",
  "ProspectHandoffAccepted",
] as const;

export const PARTNER_REGISTRY_EVENT_NAMES = ["PartnerCreated", "PartnerCapabilityAdded", "TransportAssetRegistered", "TransportCapabilityUpdated"] as const;

export const DELIVERY_CARGO_EVENT_NAMES = [
  "ShipmentProfileCreated",
  "ShipmentProfileUpdated",
  "TransportRequirementsCalculated",
  "DeliveryCargoClassificationRequested",
  "ShipmentClassifiedAsDelivery",
  "ShipmentClassifiedAsCargo",
  "ShipmentNeedsManualReview",
  "DeliveryOrderCreated",
  "CargoOrderCreated",
  "CargoCarrierMatched",
  "CargoAssignmentCreated",
] as const;
