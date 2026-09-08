// Passenger lead lifecycle (Mira Pass 1 spec s.11) — a PURE DERIVED MAPPING
// over the existing RequestStatus/ShipmentStatus enums, never a new Prisma
// enum. Spec s.11/s.23: "Do NOT introduce duplicate enums if the repository
// already has equivalent booking/lead states. Map/extend existing types
// cleanly." This module only labels states for CRM reporting; it never
// writes anything.
import type { RequestStatus, ShipmentStatus } from "@prisma/client";
import type { DeclineReasonCategory } from "./decline-reason";

export type PassengerLeadStage =
  | "NEW"
  | "QUALIFIED"
  | "SEARCHING"
  | "OFFERED"
  | "BOOKED"
  | "CONFIRMED"
  | "COMPLETED"
  | "DECLINED"
  | "CANCELLED"
  | "UNFULFILLED";

export interface DeriveLeadStageInput {
  /** null/undefined = no TripRequest row exists yet for this lead (still a
   * conversation-only NEW inquiry). */
  requestStatus?: RequestStatus | null;
  /** Set when the request was cancelled/expired AFTER a decline reason was
   * captured (spec s.12) — distinguishes an active customer decision
   * (DECLINED) from a passive timeout (UNFULFILLED) or a plain cancel
   * (CANCELLED). RequestStatus itself has no DECLINED value to reuse. */
  declineReasonCategory?: DeclineReasonCategory | null;
}

/** RequestStatus has no distinct "booked vs confirmed" granularity (a single
 * CONFIRMED value covers both) — this mapping is honest about that rather
 * than inventing a distinction the underlying data can't actually support. */
export function deriveLeadStage(input: DeriveLeadStageInput): PassengerLeadStage {
  const { requestStatus, declineReasonCategory } = input;

  if (!requestStatus) return "NEW";

  switch (requestStatus) {
    case "PENDING":
      return "QUALIFIED";
    case "MATCHING":
      return "SEARCHING";
    case "MATCHED":
      return "OFFERED";
    case "CONFIRMED":
      return "CONFIRMED";
    case "COMPLETED":
      return "COMPLETED";
    case "EXPIRED":
      return "UNFULFILLED";
    case "CANCELLED":
      return declineReasonCategory ? "DECLINED" : "CANCELLED";
    default:
      return "UNFULFILLED";
  }
}

export type CargoLeadStage = "NEW" | "SEARCHING" | "OFFERED" | "BOOKED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "UNFULFILLED";

/** Same derived-mapping approach for Sapar's cargo lifecycle, so a future
 * combined CRM view can report passenger and cargo leads on one consistent
 * stage vocabulary without a third parallel enum. */
export function deriveCargoLeadStage(status: ShipmentStatus): CargoLeadStage {
  switch (status) {
    case "DRAFT":
    case "NEEDS_INFO":
      return "NEW";
    case "READY_FOR_MATCHING":
    case "SEARCHING":
      return "SEARCHING";
    case "QUOTED":
    case "AWAITING_CONFIRMATION":
      return "OFFERED";
    case "CONFIRMED":
    case "AWAITING_PICKUP":
      return "BOOKED";
    case "PICKED_UP":
    case "IN_TRANSIT":
    case "AT_TRANSFER_POINT":
    case "OUT_FOR_DELIVERY":
    case "DISPUTED":
      return "IN_PROGRESS";
    case "DELIVERED":
      return "COMPLETED";
    case "FAILED":
      return "UNFULFILLED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "UNFULFILLED";
  }
}
