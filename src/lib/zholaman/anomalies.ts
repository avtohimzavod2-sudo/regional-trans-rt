// Operational-anomaly detection for the delivery/cargo direction. Pure, for
// the same reasons as src/lib/akzhol/anomalies.ts, and under the same two
// rules: a null rate produces no finding (an empty period is not a failing
// one), and a missing measurement is reported as a gap rather than as a pass.
import { formatRate } from "@/lib/management/metrics";
import type { CargoOperationalAnomaly } from "./types";

export const CARGO_ANOMALY_THRESHOLDS = {
  /** Orders that end in FAILED. */
  failureRate: 0.1,
  /** Delivered shipments that missed a deadline they actually carried. */
  latenessRate: 0.25,
  /** Incidents per order. Above this the operation is improvising. */
  incidentRatePerOrder: 0.2,
  /** Share of the period's orders on one executor. Concentration reads as
   * healthy volume right up until that executor stops answering. */
  topExecutorShare: 0.5,
  /** Any open critical incident or complaint is an anomaly by definition; the
   * threshold exists so the finding can state what it compared against. */
  criticalOpen: 0,
  /** Share of orders whose payment posture is a problem. Counts only — the
   * amounts are Tyyin's and are never read here (spec s.21). */
  paymentProblemRate: 0.1,
  /** Executors taking work while still UNVERIFIED. A group message is a
   * signal, never a vetted partner (hardening spec s.10), so this is a
   * governance finding, not a capacity one. */
  unverifiedExecutorsActive: 0,
} as const;

export interface CargoAnomalyInput {
  ordersCreated: number;
  delivered: number;
  failureRate: number | null;
  latenessRate: number | null;
  deadlinesObserved: number;
  incidentRatePerOrder: number | null;
  criticalIncidentsOpen: number;
  criticalComplaintsOpen: number;
  topExecutorShare: number | null;
  topExecutorName: string | null;
  unverifiedExecutorsActive: number;
  paymentProblemRate: number | null;
  paymentProblem: number;
}

export function detectCargoAnomalies(input: CargoAnomalyInput): CargoOperationalAnomaly[] {
  const found: CargoOperationalAnomaly[] = [];
  const t = CARGO_ANOMALY_THRESHOLDS;

  if (input.failureRate !== null && input.failureRate > t.failureRate) {
    found.push({
      code: "HIGH_CARGO_FAILURE_RATE",
      severity: "HIGH",
      detail: `${formatRate(input.failureRate)} of the ${input.ordersCreated} orders created in the period ended FAILED (threshold ${formatRate(t.failureRate)}).`,
      observedValue: input.failureRate,
      threshold: t.failureRate,
    });
  }

  // Same reasoning as DEMAND_WITHOUT_ANY_BOOKING on the passenger side: a rate
  // threshold cannot distinguish "nothing delivered out of 20 orders" from
  // "nothing delivered out of nothing".
  if (input.ordersCreated > 0 && input.delivered === 0) {
    found.push({
      code: "ORDERS_WITHOUT_ANY_DELIVERY",
      severity: "HIGH",
      detail: `${input.ordersCreated} orders were created in the period and none reached DELIVERED.`,
      observedValue: 0,
      threshold: 1,
    });
  }

  if (input.latenessRate !== null && input.latenessRate > t.latenessRate) {
    found.push({
      code: "HIGH_CARGO_LATENESS_RATE",
      severity: "ATTENTION",
      detail: `${formatRate(input.latenessRate)} of the ${input.deadlinesObserved} delivered shipments that carried a deadline missed it (threshold ${formatRate(t.latenessRate)}).`,
      observedValue: input.latenessRate,
      threshold: t.latenessRate,
    });
  }

  if (input.incidentRatePerOrder !== null && input.incidentRatePerOrder > t.incidentRatePerOrder) {
    found.push({
      code: "HIGH_INCIDENT_RATE",
      severity: "HIGH",
      detail: `${input.incidentRatePerOrder.toFixed(2)} incidents per order created (threshold ${t.incidentRatePerOrder}).`,
      observedValue: input.incidentRatePerOrder,
      threshold: t.incidentRatePerOrder,
    });
  }

  if (input.criticalIncidentsOpen > t.criticalOpen) {
    found.push({
      code: "OPEN_CRITICAL_INCIDENTS",
      severity: "CRITICAL",
      detail: `${input.criticalIncidentsOpen} critical shipment incident(s) are still open or escalated.`,
      observedValue: input.criticalIncidentsOpen,
      threshold: t.criticalOpen,
    });
  }

  if (input.criticalComplaintsOpen > t.criticalOpen) {
    found.push({
      code: "OPEN_CRITICAL_COMPLAINTS",
      severity: "CRITICAL",
      detail: `${input.criticalComplaintsOpen} critical cargo complaint(s) are still open. Adilet owns the decision; Zholaman only reports that they are unresolved.`,
      observedValue: input.criticalComplaintsOpen,
      threshold: t.criticalOpen,
    });
  }

  if (input.topExecutorShare !== null && input.topExecutorShare > t.topExecutorShare) {
    found.push({
      code: "EXECUTOR_CONCENTRATION_RISK",
      severity: "ATTENTION",
      detail: `${formatRate(input.topExecutorShare)} of the period's orders went to a single executor${input.topExecutorName ? ` (${input.topExecutorName})` : ""} (threshold ${formatRate(t.topExecutorShare)}).`,
      observedValue: input.topExecutorShare,
      threshold: t.topExecutorShare,
    });
  }

  if (input.unverifiedExecutorsActive > t.unverifiedExecutorsActive) {
    found.push({
      code: "UNVERIFIED_EXECUTORS_ACTIVE",
      severity: "HIGH",
      detail: `${input.unverifiedExecutorsActive} ACTIVE executor(s) are still UNVERIFIED. A group listing is a signal, never a vetted partner — only RT's own vetting may move an executor out of UNVERIFIED.`,
      observedValue: input.unverifiedExecutorsActive,
      threshold: t.unverifiedExecutorsActive,
    });
  }

  if (input.paymentProblemRate !== null && input.paymentProblemRate > t.paymentProblemRate) {
    found.push({
      code: "HIGH_PAYMENT_PROBLEM_RATE",
      severity: "ATTENTION",
      detail: `${input.paymentProblem} order(s), ${formatRate(input.paymentProblemRate)} of those with a payment record, are in a payment-problem state (threshold ${formatRate(t.paymentProblemRate)}). Zholaman sees the coarse status only; the amounts and the resolution belong to Tyyin and Sapargul.`,
      observedValue: input.paymentProblemRate,
      threshold: t.paymentProblemRate,
    });
  }

  return found;
}
