// Operational-anomaly detection for the passenger direction. Pure: it is
// handed already-measured numbers and returns findings, so every threshold is
// unit-testable without a database and nothing here can be influenced by a
// language model.
//
// TWO RULES THAT SHAPE EVERYTHING BELOW.
//
// 1. An anomaly is a claim about observed behaviour. When the denominator is
//    zero the rate is null, and a null rate produces NO anomaly — an empty
//    period is not a failing one. Inventing "0% confirmation rate, CRITICAL"
//    out of a quiet Tuesday is fabrication (spec s.34), and a manager who
//    learns the alerts fire on nothing will stop reading them.
//
// 2. A missing measurement is reported as a gap, never as a pass. Where the
//    distinction matters the caller records it in missingDataNotes; this
//    module simply stays silent rather than implying health it did not verify.
import { formatRate } from "@/lib/management/metrics";
import type { PassengerOperationalAnomaly } from "./types";

/** Thresholds are deliberately explicit, named and exported — a manager
 * report's alert boundary is an operational policy, not a magic number buried
 * in an if-statement. They are starting points chosen to be obviously wrong
 * rather than subtly wrong, and are expected to be tuned against real pilot
 * data before anyone is paged on them. */
export const PASSENGER_ANOMALY_THRESHOLDS = {
  /** Passengers walking away from more than this share of what they were
   * offered points at price, timing or driver quality — not at demand. */
  passengerDeclineRate: 0.4,
  /** Drivers refusing this often means Match is proposing work they do not
   * want, which burns passenger patience on both sides. */
  driverDeclineRate: 0.4,
  /** Confirmed trips that do not complete. */
  completionRateFloor: 0.8,
  /** Share of passenger loop runs that ended with no supply found. */
  noSupplyRate: 0.3,
  /** Minutes. Beyond this a passenger has usually already booked elsewhere. */
  medianPassengerResponseMinutes: 30,
  /** Any open critical complaint is an anomaly by definition — the threshold
   * exists only so the emitted finding can state what it compared against. */
  criticalComplaintsOpen: 0,
} as const;

export interface PassengerAnomalyInput {
  matchesProposedToPassenger: number;
  passengerDeclineRate: number | null;
  driverDeclineRate: number | null;
  requests: number;
  confirmed: number;
  completionRate: number | null;
  tripsCreated: number;
  noSupplyRate: number | null;
  loopRuns: number;
  medianPassengerResponseMinutes: number | null;
  criticalComplaintsOpen: number;
}

export function detectPassengerAnomalies(input: PassengerAnomalyInput): PassengerOperationalAnomaly[] {
  const found: PassengerOperationalAnomaly[] = [];
  const t = PASSENGER_ANOMALY_THRESHOLDS;

  if (input.passengerDeclineRate !== null && input.passengerDeclineRate > t.passengerDeclineRate) {
    found.push({
      code: "HIGH_PASSENGER_DECLINE_RATE",
      severity: "HIGH",
      detail: `Passengers declined ${formatRate(input.passengerDeclineRate)} of the ${input.matchesProposedToPassenger} matches proposed to them (threshold ${formatRate(t.passengerDeclineRate)}).`,
      observedValue: input.passengerDeclineRate,
      threshold: t.passengerDeclineRate,
    });
  }

  if (input.driverDeclineRate !== null && input.driverDeclineRate > t.driverDeclineRate) {
    found.push({
      code: "HIGH_DRIVER_DECLINE_RATE",
      severity: "ATTENTION",
      detail: `Drivers declined ${formatRate(input.driverDeclineRate)} of the matches proposed to them (threshold ${formatRate(t.driverDeclineRate)}).`,
      observedValue: input.driverDeclineRate,
      threshold: t.driverDeclineRate,
    });
  }

  // Demand that produces no booking at all is a different failure from a poor
  // conversion rate, and it is invisible to a rate threshold: 0 confirmed out
  // of 12 requests and 0 out of 0 both compute to the same null.
  if (input.requests > 0 && input.confirmed === 0) {
    found.push({
      code: "DEMAND_WITHOUT_ANY_BOOKING",
      severity: "HIGH",
      detail: `${input.requests} passenger requests in the period produced no confirmed booking at all.`,
      observedValue: 0,
      threshold: 1,
    });
  }

  if (input.completionRate !== null && input.completionRate < t.completionRateFloor) {
    found.push({
      code: "LOW_TRIP_COMPLETION_RATE",
      severity: "HIGH",
      detail: `Only ${formatRate(input.completionRate)} of the ${input.tripsCreated} trips created completed (floor ${formatRate(t.completionRateFloor)}).`,
      observedValue: input.completionRate,
      threshold: t.completionRateFloor,
    });
  }

  if (input.noSupplyRate !== null && input.noSupplyRate > t.noSupplyRate) {
    found.push({
      code: "HIGH_NO_SUPPLY_RATE",
      severity: "ATTENTION",
      detail: `${formatRate(input.noSupplyRate)} of the ${input.loopRuns} passenger loop runs ended with no supply found (threshold ${formatRate(t.noSupplyRate)}). This is a driver-supply problem, not a passenger-demand one.`,
      observedValue: input.noSupplyRate,
      threshold: t.noSupplyRate,
    });
  }

  if (input.medianPassengerResponseMinutes !== null && input.medianPassengerResponseMinutes > t.medianPassengerResponseMinutes) {
    found.push({
      code: "SLOW_PASSENGER_HANDLING",
      severity: "ATTENTION",
      detail: `Median passenger response time was ${input.medianPassengerResponseMinutes} minutes (threshold ${t.medianPassengerResponseMinutes}).`,
      observedValue: input.medianPassengerResponseMinutes,
      threshold: t.medianPassengerResponseMinutes,
    });
  }

  if (input.criticalComplaintsOpen > t.criticalComplaintsOpen) {
    found.push({
      code: "OPEN_CRITICAL_COMPLAINTS",
      severity: "CRITICAL",
      detail: `${input.criticalComplaintsOpen} critical passenger complaint(s) are still open. Adilet owns the decision; Akzhol only reports that they are unresolved.`,
      observedValue: input.criticalComplaintsOpen,
      threshold: t.criticalComplaintsOpen,
    });
  }

  return found;
}
