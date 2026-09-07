// ADILET weekly report (AGENTS Adilet spec s.26/s.27/s.55). Bounded,
// indexed queries only — a weekly report must never scan unbounded history
// synchronously (spec s.37). Every serious decision carries enough
// structured basis (policyBasis/proportionalityReason/verifiedFacts) for
// the director to see the full explanation without opening the case (spec
// s.27/s.28), but never more personal data than that summary needs (spec
// s.44/s.55).
import { db } from "@/lib/db";
import type { WeeklyReport, WeeklyReportSeriousDecision } from "./types";

const SERIOUS_SANCTION_TYPES = ["BLOCKED", "SUSPENDED", "TEMPORARY_SUSPENSION", "RELIABILITY_PENALTY"] as const;
const MAX_SERIOUS_DECISIONS = 100;

export async function buildWeeklyReport(from: Date, to: Date): Promise<WeeklyReport> {
  const periodWhere = { openedAt: { gte: from, lt: to } };

  const [opened, resolved, pending, escalated, resolvedWithoutSanction, warningsIssued, temporaryRestrictions, suspensions, blocks, executorPenalties, appealsRequested, decisionsUpheld, decisionsModified, decisionsOverturned, insufficientEvidenceCases, unresolvedHighSeverityCases, seriousSanctionRows] = await Promise.all([
    db.adiletCase.count({ where: periodWhere }),
    db.adiletCase.count({ where: { ...periodWhere, status: "DECIDED" } }),
    db.adiletCase.count({ where: { ...periodWhere, status: { in: ["OPEN", "UNDER_REVIEW", "AWAITING_EVIDENCE"] } } }),
    db.adiletCase.count({ where: { ...periodWhere, reviewMode: "DIRECTOR_REVIEW" } }),
    db.adiletDecision.count({ where: { decidedAt: { gte: from, lt: to }, outcome: { in: ["NO_VIOLATION", "RESOLVED_NO_SANCTION"] } } }),
    db.adiletSanction.count({ where: { createdAt: { gte: from, lt: to }, sanctionType: { in: ["FORMAL_WARNING", "ADVISORY"] } } }),
    db.adiletSanction.count({ where: { createdAt: { gte: from, lt: to }, sanctionType: "TEMPORARY_RESTRICTION" } }),
    db.adiletSanction.count({ where: { createdAt: { gte: from, lt: to }, sanctionType: { in: ["SUSPENDED", "TEMPORARY_SUSPENSION"] } } }),
    db.adiletSanction.count({ where: { createdAt: { gte: from, lt: to }, sanctionType: "BLOCKED" } }),
    db.adiletSanction.count({ where: { createdAt: { gte: from, lt: to }, subjectType: "EXECUTOR", sanctionType: { in: ["RELIABILITY_PENALTY", "LIMITED_ACCESS"] } } }),
    db.adiletAppeal.count({ where: { createdAt: { gte: from, lt: to } } }),
    db.adiletAppeal.count({ where: { reviewedAt: { gte: from, lt: to }, status: "UPHELD" } }),
    db.adiletAppeal.count({ where: { reviewedAt: { gte: from, lt: to }, status: "MODIFIED" } }),
    db.adiletAppeal.count({ where: { reviewedAt: { gte: from, lt: to }, status: "OVERTURNED" } }),
    db.adiletDecision.count({ where: { decidedAt: { gte: from, lt: to }, outcome: "INSUFFICIENT_EVIDENCE" } }),
    db.adiletCase.count({ where: { severity: { in: ["HIGH", "CRITICAL"] }, status: { in: ["OPEN", "UNDER_REVIEW", "AWAITING_EVIDENCE"] } } }),
    db.adiletSanction.findMany({
      where: { createdAt: { gte: from, lt: to }, sanctionType: { in: [...SERIOUS_SANCTION_TYPES] } },
      include: { case: true, decision: true },
      orderBy: { createdAt: "desc" },
      take: MAX_SERIOUS_DECISIONS,
    }),
  ]);

  const resolvedCasesForLatency = await db.adiletCase.findMany({
    where: { ...periodWhere, status: "DECIDED", resolvedAt: { not: null } },
    select: { openedAt: true, resolvedAt: true },
    take: 500,
  });
  const resolutionTimes = resolvedCasesForLatency.map((c) => (c.resolvedAt as Date).getTime() - c.openedAt.getTime());
  const averageResolutionTimeMs = resolutionTimes.length > 0 ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length : null;

  const repeatedOffenderSubjects = new Set<string>();
  const subjectCounts = await db.adiletSanction.groupBy({ by: ["subjectId"], where: { createdAt: { gte: from, lt: to } }, _count: { _all: true } });
  for (const row of subjectCounts) if (row._count._all > 1) repeatedOffenderSubjects.add(row.subjectId);

  const seriousDecisions: WeeklyReportSeriousDecision[] = seriousSanctionRows.map((s) => ({
    caseId: s.caseId,
    subjectType: s.subjectType,
    violationType: s.case.caseType,
    verifiedFactsSummary: s.decision.verifiedFacts,
    policyBasis: s.decision.policyBasis,
    sanction: s.sanctionType,
    proportionalityReason: s.decision.proportionalityReason,
    duration: s.decision.duration,
    appealStatus: s.case.appealStatus,
    currentState: s.status,
  }));

  return {
    period: { from, to },
    cases: { opened, resolved, pending, escalated },
    outcomes: {
      resolvedWithoutSanction,
      warningsIssued,
      temporaryRestrictions,
      suspensions,
      blocks,
      executorPenalties,
      appealsRequested,
      decisionsUpheld,
      decisionsModified,
      decisionsOverturned,
    },
    quality: {
      averageResolutionTimeMs,
      repeatedOffenderCount: repeatedOffenderSubjects.size,
      insufficientEvidenceCases,
      unresolvedHighSeverityCases,
    },
    seriousDecisions,
  };
}
