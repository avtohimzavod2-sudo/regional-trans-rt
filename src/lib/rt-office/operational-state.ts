// Pure, DB-free derivation of the spec's 10-state operational vocabulary
// (spec s.8) from RT Core's EXISTING Prisma enums (DriverStatus,
// OfferStatus, TripStatus) plus two explicit, never-inferred CRM Auto
// signals. Deliberately not a second status system: nothing here is
// persisted — it is recomputed from source-of-truth fields every time a
// fact is requested. Critical state transitions must be deterministic code,
// not free-form LLM decisions (spec s.8) — this function is that code.
import type { OperationalState } from "./types";

export interface OperationalStateInput {
  driverStatus: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "BLOCKED";
  /** True iff the driver has an unresolved DriveCrmEvent(BREAKDOWN_INCIDENT, OPEN). */
  hasOpenBreakdown: boolean;
  activeOfferStatus: "OPEN" | "PARTIALLY_FILLED" | "FULL" | "CLOSED" | "CANCELLED" | null;
  activeTripStatus: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | null;
  /** True only when a verified DriveCrmEvent explicitly flags delay
   * (details.delayed === true) — RT OFFICE never infers "late" from
   * wall-clock comparisons; that would be inventing operational fact. */
  delayedSignal: boolean;
  /** Same rule as delayedSignal, for "arrived at destination but not yet
   * administratively completed" — Trip has no persisted ARRIVED status. */
  arrivedSignal: boolean;
}

export function deriveOperationalState(input: OperationalStateInput): OperationalState {
  if (input.hasOpenBreakdown) return "BREAKDOWN";

  if (input.activeTripStatus === "CANCELLED" || input.activeTripStatus === "NO_SHOW") return "CANCELLED";
  if (input.activeTripStatus === "COMPLETED") return input.arrivedSignal ? "ARRIVED" : "COMPLETED";
  if (input.activeTripStatus === "IN_PROGRESS") return input.delayedSignal ? "DELAYED" : "EN_ROUTE";
  if (input.activeTripStatus === "SCHEDULED") return "WAITING_DEPARTURE";

  if (input.driverStatus !== "ACTIVE") return "OFFLINE";

  if (input.activeOfferStatus === "OPEN" || input.activeOfferStatus === "PARTIALLY_FILLED") return "PLANNED";

  return "AVAILABLE";
}
