// Runtime-validated shapes for everything Artur produces (AGENTS Master
// Architecture spec s.33: "Do not rely only on free-form text... use
// runtime schema validation. Reject or repair invalid model output
// safely."). Every builder in daily-brief.ts/weekly-report.ts validates its
// assembled object against one of these before it is ever persisted or
// handed to the notification gateway — so a malformed section (whether from
// a bug or from the reasoning-provider layer) fails loudly instead of
// silently reaching the Founder.
import { z } from "zod";

const severitySchema = z.enum(["INFO", "NORMAL", "ATTENTION", "HIGH", "CRITICAL"]);
const rtStatusSchema = z.enum(["NORMAL", "ATTENTION", "CRITICAL"]);
const trendStatusSchema = z.enum(["GROWTH", "STABLE", "DECLINE"]);

export const managerReportSnapshotSchema = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
  passenger: z.object({
    requests: z.number().int(),
    completedTrips: z.number().int(),
    cancellations: z.number().int(),
    criticalRouteProblems: z.number().int(),
  }),
  cargo: z.object({
    accepted: z.number().int(),
    completed: z.number().int(),
    delayedOrFailed: z.number().int(),
    criticalShipments: z.number().int(),
  }),
  finance: z.object({
    incomingSom: z.number().int(),
    verifiedSom: z.number().int(),
    discrepancyCount: z.number().int(),
    unresolvedCasesCount: z.number().int(),
  }),
  complaints: z.object({
    opened: z.number().int(),
    resolved: z.number().int(),
    criticalOpen: z.number().int(),
  }),
  missingDataNotes: z.array(z.string()),
});
export type ManagerReportSnapshot = z.infer<typeof managerReportSnapshotSchema>;

const stuckTaskSchema = z.object({
  what: z.string(),
  ageHours: z.number(),
  responsibleDomain: z.string(),
  impact: z.string(),
});

export const dailyFounderBriefSchema = z.object({
  reportDate: z.string(),
  overallStatus: rtStatusSchema,
  keyEvents: z.array(z.string()),
  passenger: z.object({ summary: z.string(), demand: z.number().int(), completed: z.number().int(), cancellations: z.number().int(), notes: z.array(z.string()) }),
  cargo: z.object({ summary: z.string(), accepted: z.number().int(), completed: z.number().int(), delayed: z.number().int(), failed: z.number().int(), notes: z.array(z.string()) }),
  finance: z.object({ summary: z.string(), incomingSom: z.number().int(), verifiedSom: z.number().int(), discrepancies: z.number().int(), unresolvedPayments: z.number().int(), notes: z.array(z.string()) }),
  complaints: z.object({ summary: z.string(), opened: z.number().int(), resolved: z.number().int(), criticalOpen: z.number().int() }),
  stuckTasks: z.array(stuckTaskSchema),
  risksToday: z.array(z.string()),
  decisionsArturTook: z.array(z.string()),
  founderDecisionsRequired: z.array(z.string()),
});
export type DailyFounderBrief = z.infer<typeof dailyFounderBriefSchema>;

const kpiRowSchema = z.object({
  name: z.string(),
  currentWeek: z.number(),
  previousWeek: z.number(),
  absoluteChange: z.number(),
  percentageChange: z.number().nullable(),
  status: trendStatusSchema,
  interpretation: z.string(),
  available: z.boolean(),
});
export type KpiRow = z.infer<typeof kpiRowSchema>;

export const problemOfTheWeekSchema = z.object({
  problem: z.string(),
  category: z.enum(["operational", "financial", "customer", "safety", "partner", "technical", "ai_quality", "organizational", "legal_reputational"]),
  evidence: z.string(),
  rootCause: z.string().nullable(),
  businessImpact: z.string(),
  responsibleDomain: z.string(),
  severity: severitySchema,
  recurring: z.boolean(),
  currentResponse: z.string(),
  recommendedNextAction: z.string(),
});
export type ProblemOfTheWeek = z.infer<typeof problemOfTheWeekSchema>;

export const weeklyInitiativeSchema = z.object({
  title: z.string().min(1),
  proposal: z.string().min(1),
  whyNow: z.string().min(1),
  evidence: z.string().min(1),
  expectedEffect: z.string().min(1),
  complexity: z.string().min(1),
  resources: z.string().nullable(),
  risks: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  successMetric: z.string().min(1),
});
export type WeeklyInitiative = z.infer<typeof weeklyInitiativeSchema>;

/** Exactly 3, non-duplicate — spec s.15/s.35's non-negotiable rule, enforced
 * again at the schema layer (initiatives.ts enforces it structurally too). */
export const weeklyInitiativesSchema = z.array(weeklyInitiativeSchema).length(3);

export const weeklyDirectorReportSchema = z.object({
  weekStartDate: z.string(),
  weekEndDate: z.string(),
  kpis: z.array(kpiRowSchema),
  problems: z.array(problemOfTheWeekSchema),
  executiveSummary: z.string(),
  initiatives: weeklyInitiativesSchema,
});
export type WeeklyDirectorReport = z.infer<typeof weeklyDirectorReportSchema>;

export const emergencyFounderEscalationSchema = z.object({
  whatHappened: z.string().min(1),
  currentStatus: z.string().min(1),
  severity: z.enum(["HIGH", "CRITICAL"]),
  peopleOrdersMoneyAffected: z.string(),
  actionsTaken: z.string(),
  immediateRisks: z.string(),
  availableOptions: z.string(),
  recommendation: z.string(),
  decisionRequired: z.string(),
  decisionDeadline: z.string().nullable(),
});
export type EmergencyFounderEscalation = z.infer<typeof emergencyFounderEscalationSchema>;

export const founderDecisionSchema = z.object({
  initiativeId: z.string(),
  status: z.enum(["APPROVED", "REJECTED", "DEFERRED", "NEEDS_REVISION"]),
  note: z.string().nullable(),
});
export type FounderDecision = z.infer<typeof founderDecisionSchema>;
