import { describe, expect, it } from "vitest";
import { PASSENGER_ANOMALY_THRESHOLDS, detectPassengerAnomalies, type PassengerAnomalyInput } from "./anomalies";

const t = PASSENGER_ANOMALY_THRESHOLDS;

/** A healthy period. Each test perturbs exactly one dimension, so a finding
 * that appears can only have come from the field under test. */
const HEALTHY: PassengerAnomalyInput = {
  matchesProposedToPassenger: 50,
  passengerDeclineRate: 0.1,
  driverDeclineRate: 0.1,
  requests: 40,
  confirmed: 30,
  completionRate: 0.95,
  tripsCreated: 30,
  noSupplyRate: 0.05,
  loopRuns: 20,
  medianPassengerResponseMinutes: 8,
  criticalComplaintsOpen: 0,
};

/** A period in which nothing happened at all: every rate is null because every
 * denominator was zero. */
const EMPTY: PassengerAnomalyInput = {
  matchesProposedToPassenger: 0,
  passengerDeclineRate: null,
  driverDeclineRate: null,
  requests: 0,
  confirmed: 0,
  completionRate: null,
  tripsCreated: 0,
  noSupplyRate: null,
  loopRuns: 0,
  medianPassengerResponseMinutes: null,
  criticalComplaintsOpen: 0,
};

const codes = (input: PassengerAnomalyInput) => detectPassengerAnomalies(input).map((a) => a.code);

describe("detectPassengerAnomalies", () => {
  it("reports nothing for a healthy period", () => {
    expect(detectPassengerAnomalies(HEALTHY)).toEqual([]);
  });

  // Rule 1 of the module: a quiet Tuesday is not a CRITICAL incident. If empty
  // periods raised alerts, the manager would learn to ignore all of them.
  it("reports nothing for a period with no activity at all", () => {
    expect(detectPassengerAnomalies(EMPTY)).toEqual([]);
  });

  it("flags a high passenger decline rate only above the threshold", () => {
    expect(codes({ ...HEALTHY, passengerDeclineRate: t.passengerDeclineRate })).not.toContain("HIGH_PASSENGER_DECLINE_RATE");
    expect(codes({ ...HEALTHY, passengerDeclineRate: t.passengerDeclineRate + 0.01 })).toContain("HIGH_PASSENGER_DECLINE_RATE");
  });

  it("flags a high driver decline rate as a supply-side finding", () => {
    const found = detectPassengerAnomalies({ ...HEALTHY, driverDeclineRate: 0.8 });
    expect(found.map((a) => a.code)).toEqual(["HIGH_DRIVER_DECLINE_RATE"]);
    expect(found[0].severity).toBe("ATTENTION");
    expect(found[0].observedValue).toBe(0.8);
    expect(found[0].threshold).toBe(t.driverDeclineRate);
  });

  // The case a rate threshold structurally cannot see: 0 of 12 and 0 of 0 are
  // both null, and only one of them is a failure.
  it("flags demand that produced no booking at all", () => {
    expect(codes({ ...HEALTHY, requests: 12, confirmed: 0 })).toContain("DEMAND_WITHOUT_ANY_BOOKING");
    expect(codes({ ...EMPTY, requests: 0, confirmed: 0 })).not.toContain("DEMAND_WITHOUT_ANY_BOOKING");
  });

  it("flags completion below the floor, and treats the floor itself as acceptable", () => {
    expect(codes({ ...HEALTHY, completionRate: t.completionRateFloor })).not.toContain("LOW_TRIP_COMPLETION_RATE");
    expect(codes({ ...HEALTHY, completionRate: t.completionRateFloor - 0.01 })).toContain("LOW_TRIP_COMPLETION_RATE");
  });

  it("names no-supply as a driver-supply problem, not passenger demand", () => {
    const found = detectPassengerAnomalies({ ...HEALTHY, noSupplyRate: 0.5, loopRuns: 10 });
    expect(found.map((a) => a.code)).toEqual(["HIGH_NO_SUPPLY_RATE"]);
    expect(found[0].detail).toContain("driver-supply problem");
  });

  it("flags slow passenger handling in minutes", () => {
    expect(codes({ ...HEALTHY, medianPassengerResponseMinutes: t.medianPassengerResponseMinutes })).not.toContain("SLOW_PASSENGER_HANDLING");
    const found = detectPassengerAnomalies({ ...HEALTHY, medianPassengerResponseMinutes: 90 });
    expect(found[0].code).toBe("SLOW_PASSENGER_HANDLING");
    expect(found[0].observedValue).toBe(90);
  });

  it("treats any open critical complaint as CRITICAL and leaves the decision to Adilet", () => {
    const found = detectPassengerAnomalies({ ...HEALTHY, criticalComplaintsOpen: 1 });
    expect(found.map((a) => a.code)).toEqual(["OPEN_CRITICAL_COMPLAINTS"]);
    expect(found[0].severity).toBe("CRITICAL");
    expect(found[0].detail).toContain("Adilet owns the decision");
  });

  it("reports every independent problem rather than only the first", () => {
    const found = codes({
      ...HEALTHY,
      passengerDeclineRate: 0.9,
      driverDeclineRate: 0.9,
      completionRate: 0.2,
      noSupplyRate: 0.9,
      medianPassengerResponseMinutes: 120,
      criticalComplaintsOpen: 2,
    });
    expect(found).toEqual([
      "HIGH_PASSENGER_DECLINE_RATE",
      "HIGH_DRIVER_DECLINE_RATE",
      "LOW_TRIP_COMPLETION_RATE",
      "HIGH_NO_SUPPLY_RATE",
      "SLOW_PASSENGER_HANDLING",
      "OPEN_CRITICAL_COMPLAINTS",
    ]);
  });

  // A null rate carries no information, and "no information" must never be
  // rendered as "0%" inside a finding a human will act on.
  it("never renders a null measurement as a percentage", () => {
    for (const finding of detectPassengerAnomalies({ ...EMPTY, criticalComplaintsOpen: 1 })) {
      expect(finding.detail).not.toContain("0%");
    }
  });
});
