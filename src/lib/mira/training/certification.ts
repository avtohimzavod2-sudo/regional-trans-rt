// Certification decision logic. This function is the one place the spec's
// hardest constraint lives in code: an automated benchmark run may only
// ever move Mira between TRAINEE and CERTIFICATION_PENDING. CERTIFIED,
// PRODUCTION_APPROVED, and SUSPENDED are exclusively human/admin
// decisions recorded elsewhere (the dispatcher UI) and must never be
// returned from here, no matter how clean a run's KPI numbers are.
import type { KpiSummary } from "./kpi";
import { meetsThresholds } from "./kpi";

export type AutomatedCertificationStatus = "TRAINEE" | "CERTIFICATION_PENDING";

export interface CertificationDecision {
  status: AutomatedCertificationStatus;
  reason: string;
}

/** currentStatus is accepted for symmetry/future use (e.g. not regressing
 * a SUSPENDED status automatically) but the return value is always one of
 * the two automated-safe statuses regardless of what's passed in — a
 * human-set CERTIFIED/PRODUCTION_APPROVED/SUSPENDED status is never read
 * or reproduced by this function. Callers that need to preserve a human
 * decision must do so explicitly, outside this function. */
export function decideCertificationStatus(summary: KpiSummary): CertificationDecision {
  if (summary.totalCases === 0) {
    return { status: "TRAINEE", reason: "No benchmark cases were run." };
  }

  if (meetsThresholds(summary)) {
    return {
      status: "CERTIFICATION_PENDING",
      reason: "All KPI thresholds met — awaiting human certification review. Never auto-promoted further.",
    };
  }

  return { status: "TRAINEE", reason: "One or more KPI thresholds were not met." };
}
