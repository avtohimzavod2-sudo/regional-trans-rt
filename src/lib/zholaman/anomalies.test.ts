import { describe, expect, it } from "vitest";
import { CARGO_ANOMALY_THRESHOLDS, detectCargoAnomalies, type CargoAnomalyInput } from "./anomalies";

const t = CARGO_ANOMALY_THRESHOLDS;

const HEALTHY: CargoAnomalyInput = {
  ordersCreated: 60,
  delivered: 52,
  failureRate: 0.02,
  latenessRate: 0.05,
  deadlinesObserved: 40,
  incidentRatePerOrder: 0.05,
  criticalIncidentsOpen: 0,
  criticalComplaintsOpen: 0,
  topExecutorShare: 0.2,
  topExecutorName: "Партнёр А",
  unverifiedExecutorsActive: 0,
  paymentProblemRate: 0.01,
  paymentProblem: 1,
};

/** Nothing happened: every denominator was zero, so every rate is null. */
const EMPTY: CargoAnomalyInput = {
  ordersCreated: 0,
  delivered: 0,
  failureRate: null,
  latenessRate: null,
  deadlinesObserved: 0,
  incidentRatePerOrder: null,
  criticalIncidentsOpen: 0,
  criticalComplaintsOpen: 0,
  topExecutorShare: null,
  topExecutorName: null,
  unverifiedExecutorsActive: 0,
  paymentProblemRate: null,
  paymentProblem: 0,
};

const codes = (input: CargoAnomalyInput) => detectCargoAnomalies(input).map((a) => a.code);

describe("detectCargoAnomalies", () => {
  it("reports nothing for a healthy period", () => {
    expect(detectCargoAnomalies(HEALTHY)).toEqual([]);
  });

  it("reports nothing for a period with no orders at all", () => {
    expect(detectCargoAnomalies(EMPTY)).toEqual([]);
  });

  it("flags a failure rate above the threshold, treating the threshold as acceptable", () => {
    expect(codes({ ...HEALTHY, failureRate: t.failureRate })).not.toContain("HIGH_CARGO_FAILURE_RATE");
    expect(codes({ ...HEALTHY, failureRate: t.failureRate + 0.01 })).toContain("HIGH_CARGO_FAILURE_RATE");
  });

  it("flags orders that produced no delivery at all, which no rate threshold can see", () => {
    expect(codes({ ...HEALTHY, ordersCreated: 20, delivered: 0 })).toContain("ORDERS_WITHOUT_ANY_DELIVERY");
    expect(codes(EMPTY)).not.toContain("ORDERS_WITHOUT_ANY_DELIVERY");
  });

  it("flags lateness only over shipments that actually carried a deadline", () => {
    const found = detectCargoAnomalies({ ...HEALTHY, latenessRate: 0.6, deadlinesObserved: 10 });
    expect(found.map((a) => a.code)).toEqual(["HIGH_CARGO_LATENESS_RATE"]);
    expect(found[0].detail).toContain("10 delivered shipments that carried a deadline");
    // Lateness is a service-quality problem, not a loss of the cargo.
    expect(found[0].severity).toBe("ATTENTION");
  });

  it("flags an incident rate per order", () => {
    const found = detectCargoAnomalies({ ...HEALTHY, incidentRatePerOrder: 0.75 });
    expect(found.map((a) => a.code)).toEqual(["HIGH_INCIDENT_RATE"]);
    expect(found[0].detail).toContain("0.75 incidents per order");
  });

  it("treats any open critical incident as CRITICAL", () => {
    const found = detectCargoAnomalies({ ...HEALTHY, criticalIncidentsOpen: 2 });
    expect(found.map((a) => a.code)).toEqual(["OPEN_CRITICAL_INCIDENTS"]);
    expect(found[0].severity).toBe("CRITICAL");
  });

  it("reports an open critical complaint without proposing an outcome", () => {
    const found = detectCargoAnomalies({ ...HEALTHY, criticalComplaintsOpen: 1 });
    expect(found.map((a) => a.code)).toEqual(["OPEN_CRITICAL_COMPLAINTS"]);
    expect(found[0].detail).toContain("Adilet owns the decision");
  });

  // Concentration reads as healthy volume right up until that one executor
  // stops answering, which is exactly when it stops being visible as volume.
  it("flags executor concentration and names the executor when known", () => {
    const found = detectCargoAnomalies({ ...HEALTHY, topExecutorShare: 0.8, topExecutorName: "Партнёр Б" });
    expect(found.map((a) => a.code)).toEqual(["EXECUTOR_CONCENTRATION_RISK"]);
    expect(found[0].detail).toContain("Партнёр Б");
  });

  it("flags concentration without a name rather than inventing one", () => {
    const found = detectCargoAnomalies({ ...HEALTHY, topExecutorShare: 0.8, topExecutorName: null });
    expect(found.map((a) => a.code)).toEqual(["EXECUTOR_CONCENTRATION_RISK"]);
    expect(found[0].detail).toContain("a single executor (threshold");
    expect(found[0].detail).not.toMatch(/null|undefined/);
  });

  it("flags active-but-unverified executors as a governance finding", () => {
    const found = detectCargoAnomalies({ ...HEALTHY, unverifiedExecutorsActive: 3 });
    expect(found.map((a) => a.code)).toEqual(["UNVERIFIED_EXECUTORS_ACTIVE"]);
    expect(found[0].detail).toContain("never a vetted partner");
  });

  // Spec s.21: Zholaman sees the coarse status only. The finding must say so,
  // so nobody reads it as a licence to chase the money.
  it("flags a payment-problem rate while keeping the money with Tyyin and Sapargul", () => {
    const found = detectCargoAnomalies({ ...HEALTHY, paymentProblemRate: 0.4, paymentProblem: 8 });
    expect(found.map((a) => a.code)).toEqual(["HIGH_PAYMENT_PROBLEM_RATE"]);
    expect(found[0].detail).toContain("Tyyin and Sapargul");
    expect(found[0].detail).not.toMatch(/\d+\s*(сом|som|KGS)/i);
  });

  it("reports every independent problem rather than only the first", () => {
    expect(
      codes({
        ...HEALTHY,
        failureRate: 0.5,
        latenessRate: 0.9,
        incidentRatePerOrder: 1.5,
        criticalIncidentsOpen: 1,
        criticalComplaintsOpen: 1,
        topExecutorShare: 0.9,
        unverifiedExecutorsActive: 1,
        paymentProblemRate: 0.5,
      }),
    ).toEqual([
      "HIGH_CARGO_FAILURE_RATE",
      "HIGH_CARGO_LATENESS_RATE",
      "HIGH_INCIDENT_RATE",
      "OPEN_CRITICAL_INCIDENTS",
      "OPEN_CRITICAL_COMPLAINTS",
      "EXECUTOR_CONCENTRATION_RISK",
      "UNVERIFIED_EXECUTORS_ACTIVE",
      "HIGH_PAYMENT_PROBLEM_RATE",
    ]);
  });

  it("never renders a null measurement as a percentage", () => {
    for (const finding of detectCargoAnomalies({ ...EMPTY, criticalIncidentsOpen: 1 })) {
      expect(finding.detail).not.toContain("0%");
    }
  });
});
