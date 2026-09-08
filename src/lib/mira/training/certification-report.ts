// Machine-readable certification report: composes a benchmark run's scores
// into PASS/FAIL results across the 6 categories Mira is certified against
// (Mira Pass 1 spec s.8), with per-category scores and failed-case detail.
// This is a reporting layer ONLY — it never writes to MiraCertification and
// never replaces certification.ts's decideCertificationStatus(), which
// remains the sole place an automated run may return TRAINEE or
// CERTIFICATION_PENDING (never CERTIFIED/PRODUCTION_APPROVED). This module
// may only ever downgrade that decision (CERTIFICATION_PENDING -> TRAINEE)
// when a mandatory category fails outright — it can never upgrade it, so a
// clean-looking KPI run can still be correctly reported as not-yet-ready
// when e.g. safe routing or continuity is broken.
import { getBenchmarkCase } from "./benchmark-cases";
import type { KpiSummary } from "./kpi";
import type { CaseScoreResult } from "./scoring";
import { decideCertificationStatus, type AutomatedCertificationStatus } from "./certification";

export type CertificationCategory =
  | "LANGUAGE_UNDERSTANDING"
  | "STRUCTURED_EXTRACTION"
  | "CLARIFICATION_DISCIPLINE"
  | "HALLUCINATION_PREVENTION"
  | "CONVERSATION_CONTINUITY"
  | "SAFE_ROUTING";

export type CategoryStatus = "PASS" | "FAIL" | "NOT_EVALUATED";

export interface FailedCaseDetail {
  code: string;
  failureCategories: CaseScoreResult["failureCategories"];
}

export interface CategoryReport {
  category: CertificationCategory;
  applicableCases: number;
  passedCases: number;
  score: number | null;
  status: CategoryStatus;
  failedCases: FailedCaseDetail[];
}

export interface CertificationReport {
  status: AutomatedCertificationStatus;
  reason: string;
  totalCases: number;
  categories: CategoryReport[];
}

interface CategoryCheck {
  category: CertificationCategory;
  applicable: (score: CaseScoreResult) => boolean;
  passed: (score: CaseScoreResult) => boolean;
}

// STRUCTURED_EXTRACTION rolls up every normalized-field check into one
// category (role/route/date-time/seats/phone) — a case only counts as
// passing structured extraction if every sub-field it has an expectation
// for was extracted correctly.
const STRUCTURED_EXTRACTION_CHECK: CategoryCheck = {
  category: "STRUCTURED_EXTRACTION",
  applicable: (s) => s.roleApplicable || s.routeApplicable || s.dateTimeApplicable || s.seatsApplicable || s.phoneApplicable,
  passed: (s) =>
    (!s.roleApplicable || s.roleCorrect) &&
    (!s.routeApplicable || s.routeCorrect) &&
    (!s.dateTimeApplicable || s.dateTimeCorrect) &&
    (!s.seatsApplicable || s.seatsCorrect) &&
    (!s.phoneApplicable || s.phoneCorrect),
};

// CONVERSATION_CONTINUITY has no dedicated field on CaseScoreResult — it is
// exercised by benchmark cases tagged CORRECTION_NEXT_MESSAGE (category O),
// which benchmark.ts feeds their priorTurns as conversationContext. A case
// is applicable to this category purely by having that tag on its
// BenchmarkCase definition, looked up by code (reuses the existing
// getBenchmarkCase(), no new lookup structure).
function isContinuityCase(code: string): boolean {
  return getBenchmarkCase(code)?.categories?.includes("CORRECTION_NEXT_MESSAGE") ?? false;
}

const CATEGORY_CHECKS: CategoryCheck[] = [
  {
    category: "LANGUAGE_UNDERSTANDING",
    applicable: (s) => s.languageApplicable,
    passed: (s) => s.languageCorrect,
  },
  STRUCTURED_EXTRACTION_CHECK,
  {
    category: "CLARIFICATION_DISCIPLINE",
    applicable: (s) => s.clarificationApplicable,
    passed: (s) => s.clarificationCorrect,
  },
  {
    category: "HALLUCINATION_PREVENTION",
    applicable: () => true,
    passed: (s) => !s.hallucinated,
  },
  {
    category: "CONVERSATION_CONTINUITY",
    applicable: (s) => isContinuityCase(s.code),
    passed: (s) => s.passed,
  },
  {
    category: "SAFE_ROUTING",
    applicable: (s) => s.routingApplicable,
    passed: (s) => s.routingCorrect,
  },
];

function buildCategoryReport(check: CategoryCheck, scores: CaseScoreResult[]): CategoryReport {
  const applicableScores = scores.filter(check.applicable);
  const failedCases: FailedCaseDetail[] = [];
  let passedCases = 0;

  for (const s of applicableScores) {
    if (check.passed(s)) {
      passedCases++;
    } else {
      failedCases.push({ code: s.code, failureCategories: s.failureCategories });
    }
  }

  const applicableCases = applicableScores.length;
  const score = applicableCases === 0 ? null : passedCases / applicableCases;
  const status: CategoryStatus = applicableCases === 0 ? "NOT_EVALUATED" : passedCases === applicableCases ? "PASS" : "FAIL";

  return { category: check.category, applicableCases, passedCases, score, status, failedCases };
}

/** Builds the full machine-readable certification report for a benchmark
 * run. Never returns CERTIFIED/PRODUCTION_APPROVED — status can only be
 * TRAINEE or CERTIFICATION_PENDING, same guarantee as certification.ts. */
export function buildCertificationReport(scores: CaseScoreResult[], summary: KpiSummary): CertificationReport {
  const categories = CATEGORY_CHECKS.map((check) => buildCategoryReport(check, scores));
  const baseDecision = decideCertificationStatus(summary);

  const failedCategories = categories.filter((c) => c.status === "FAIL");
  if (failedCategories.length > 0 && baseDecision.status === "CERTIFICATION_PENDING") {
    return {
      status: "TRAINEE",
      reason: `Downgraded from CERTIFICATION_PENDING — mandatory categories failed: ${failedCategories.map((c) => c.category).join(", ")}.`,
      totalCases: summary.totalCases,
      categories,
    };
  }

  return { status: baseDecision.status, reason: baseDecision.reason, totalCases: summary.totalCases, categories };
}
