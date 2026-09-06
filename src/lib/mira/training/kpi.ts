// KPI aggregation over a batch of scored benchmark cases, and the
// thresholds a run must clear before Mira can even become a certification
// candidate. Pure — takes CaseScoreResult[], produces a summary. Accuracy
// is computed only over cases where the field was applicable (had an
// expected value), matching how the spec's KPIs are meant to be read.
import type { CaseScoreResult } from "./scoring";

export const KPI_THRESHOLDS = {
  role: 0.98,
  route: 0.99,
  dateTime: 0.98,
  seats: 0.99,
  phone: 0.999,
  maxHallucinationRate: 0, // zero tolerance
};

export interface KpiSummary {
  totalCases: number;
  passedCases: number;
  roleAccuracy: number | null;
  routeAccuracy: number | null;
  dateTimeAccuracy: number | null;
  seatAccuracy: number | null;
  phoneAccuracy: number | null;
  hallucinationCount: number;
  hallucinationRate: number;
  overallScore: number | null;
}

function accuracy(applicable: number, correct: number): number | null {
  return applicable === 0 ? null : correct / applicable;
}

export function computeKpiSummary(scores: CaseScoreResult[]): KpiSummary {
  const totalCases = scores.length;
  const passedCases = scores.filter((s) => s.passed).length;

  let roleApplicable = 0;
  let roleCorrect = 0;
  let routeApplicable = 0;
  let routeCorrect = 0;
  let dateTimeApplicable = 0;
  let dateTimeCorrect = 0;
  let seatsApplicable = 0;
  let seatsCorrect = 0;
  let phoneApplicable = 0;
  let phoneCorrect = 0;
  let hallucinationCount = 0;

  for (const s of scores) {
    if (s.roleApplicable) {
      roleApplicable++;
      if (s.roleCorrect) roleCorrect++;
    }
    if (s.routeApplicable) {
      routeApplicable++;
      if (s.routeCorrect) routeCorrect++;
    }
    if (s.dateTimeApplicable) {
      dateTimeApplicable++;
      if (s.dateTimeCorrect) dateTimeCorrect++;
    }
    if (s.seatsApplicable) {
      seatsApplicable++;
      if (s.seatsCorrect) seatsCorrect++;
    }
    if (s.phoneApplicable) {
      phoneApplicable++;
      if (s.phoneCorrect) phoneCorrect++;
    }
    if (s.hallucinated) hallucinationCount++;
  }

  return {
    totalCases,
    passedCases,
    roleAccuracy: accuracy(roleApplicable, roleCorrect),
    routeAccuracy: accuracy(routeApplicable, routeCorrect),
    dateTimeAccuracy: accuracy(dateTimeApplicable, dateTimeCorrect),
    seatAccuracy: accuracy(seatsApplicable, seatsCorrect),
    phoneAccuracy: accuracy(phoneApplicable, phoneCorrect),
    hallucinationCount,
    hallucinationRate: totalCases === 0 ? 0 : hallucinationCount / totalCases,
    overallScore: totalCases === 0 ? null : passedCases / totalCases,
  };
}

/** Whether a run clears every KPI threshold. A metric with no applicable
 * cases in the run (null) is treated as "not yet demonstrated" — it does
 * NOT count as passing, so an empty/narrow benchmark run can never look
 * like a clean pass. */
export function meetsThresholds(summary: KpiSummary): boolean {
  return (
    summary.roleAccuracy !== null &&
    summary.roleAccuracy >= KPI_THRESHOLDS.role &&
    summary.routeAccuracy !== null &&
    summary.routeAccuracy >= KPI_THRESHOLDS.route &&
    summary.dateTimeAccuracy !== null &&
    summary.dateTimeAccuracy >= KPI_THRESHOLDS.dateTime &&
    summary.seatAccuracy !== null &&
    summary.seatAccuracy >= KPI_THRESHOLDS.seats &&
    summary.phoneAccuracy !== null &&
    summary.phoneAccuracy >= KPI_THRESHOLDS.phone &&
    summary.hallucinationRate <= KPI_THRESHOLDS.maxHallucinationRate
  );
}
