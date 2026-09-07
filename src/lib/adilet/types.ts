// Dependency-free Adilet domain types (AGENTS Adilet spec s.11-s.19) — mirrors
// src/lib/sapargul/types.ts and src/lib/sapar/types.ts's role: the shared
// vocabulary every other Adilet file imports from, kept free of db/provider
// imports so it stays trivially unit-testable.
import type {
  ActorType,
  AdiletCaseType,
  AdiletDecisionOutcome,
  AdiletEvidenceTrust,
  AdiletEvidenceType,
  AdiletFactStatus,
  AdiletSanctionType,
  AdiletSeverity,
  AdiletSubjectType,
  AgentName,
} from "@prisma/client";

/** One piece of evidence as seen by the fairness engine — never the
 * Prisma row itself, so evaluateFairness stays pure/testable (spec s.10). */
export interface EvidenceItem {
  type: AdiletEvidenceType;
  factStatus: AdiletFactStatus;
  trust: AdiletEvidenceTrust;
  source: string;
  occurredAt: Date;
  description: string;
}

/** Result of cross-referencing a case's evidence (spec s.10/s.14): a single
 * subjective complaint is never automatic proof of guilt — insufficient
 * corroboration must surface as INSUFFICIENT_EVIDENCE, never a guilty
 * finding by default. */
export interface FairnessAssessment {
  sufficientEvidence: boolean;
  verifiedFacts: string[];
  disputedFacts: string[];
  corroboratingItemCount: number;
}

/** Input to the immediate-freeze check (spec s.6) — serious cases may skip
 * the proportional ladder for a temporary (never permanent) freeze. */
export interface SeriousCaseSignal {
  safetyThreat: boolean;
  violenceThreat: boolean;
  confirmedFraud: boolean;
  dangerousDriving: boolean;
  bypassOfFinancialOrSafetyControls: boolean;
  repeatedFakePaymentEvidence: boolean;
  provenBadFaithDamageOrLoss: boolean;
  systematicAbuse: boolean;
}

/** Input to the rudeness/insult classifier (spec s.7) — distinguishes
 * ordinary frustration from an actual conduct violation. */
export interface ConductSignal {
  priorWarningsCount: number;
  rudenessSeverity: "ORDINARY_FRUSTRATION" | "EXCESSIVE_RUDENESS" | "SEVERE_OR_SYSTEMATIC";
  continuedAfterWarning: boolean;
}

export interface LadderDecision {
  outcome: AdiletDecisionOutcome;
  sanctionType: AdiletSanctionType | null;
  proportionalityReason: string;
  durationDays: number | null;
  appealAllowed: boolean;
}

export interface WeeklyReportSeriousDecision {
  caseId: string;
  subjectType: AdiletSubjectType;
  violationType: AdiletCaseType;
  verifiedFactsSummary: string[];
  policyBasis: string;
  sanction: AdiletSanctionType | null;
  proportionalityReason: string | null;
  duration: string | null;
  appealStatus: string;
  currentState: string;
}

export interface WeeklyReportPeriod {
  from: Date;
  to: Date;
}

export interface WeeklyReport {
  period: WeeklyReportPeriod;
  cases: {
    opened: number;
    resolved: number;
    pending: number;
    escalated: number;
  };
  outcomes: {
    resolvedWithoutSanction: number;
    warningsIssued: number;
    temporaryRestrictions: number;
    suspensions: number;
    blocks: number;
    executorPenalties: number;
    appealsRequested: number;
    decisionsUpheld: number;
    decisionsModified: number;
    decisionsOverturned: number;
  };
  quality: {
    averageResolutionTimeMs: number | null;
    repeatedOffenderCount: number;
    insufficientEvidenceCases: number;
    unresolvedHighSeverityCases: number;
  };
  seriousDecisions: WeeklyReportSeriousDecision[];
}

/** What Sapar/an escalating agent gets back once Adilet has decided (spec
 * s.21) — never a raw DB row, and never an authority for the caller to
 * override. */
export interface ExecutorCaseOutcome {
  caseId: string;
  outcome: AdiletDecisionOutcome;
  sanctionType: AdiletSanctionType | null;
  reliabilityImpactNote: string | null;
  needsMoreEvidence: boolean;
  escalatedToDirector: boolean;
}

/** What Zholaman/Akzhol may see of a case (spec s.23/s.24) — outcome-level
 * only, never raw evidence or another party's personal detail (spec s.44). */
export interface ManagerCaseView {
  caseId: string;
  caseType: AdiletCaseType;
  outcome: AdiletDecisionOutcome | null;
  executorSanction: AdiletSanctionType | null;
  status: string;
  repeatOffender: boolean;
}

/** The one thing Mira is ever allowed to relay to a client (spec s.20/s.45)
 * — calm, neutral, specific, no internal reasoning. */
export interface ClientFacingCaseSummary {
  caseId: string;
  status: string;
  neutralMessage: string;
}

export interface OpenCaseInput {
  caseType: AdiletCaseType;
  severity?: AdiletSeverity;
  sourceAgent?: AgentName;
  openedByType: ActorType;
  openedById?: string;
  relatedUserId?: string;
  relatedExecutorId?: string;
  shipmentId?: string;
  tripId?: string;
  paymentId?: string;
  managerContext?: string;
  summary: string;
  allegation: string;
  sourceEventKey?: string;
}
