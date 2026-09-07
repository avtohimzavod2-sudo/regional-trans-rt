// MockArturReasoningProvider — fully deterministic, no network calls. Runs
// in tests/CI/dev without an ANTHROPIC_API_KEY (ARTUR_AI_PROVIDER=mock is
// the default — see model-provider.ts). Every sentence is template text
// built only from the numbers already in the snapshot/kpi rows it is given,
// so it can never fabricate a fact (spec s.34) — it just narrates real
// counts. Always emits exactly 3 initiatives so the exactly-3 invariant
// (spec s.15/s.35) holds even with no live model configured.
import type {
  ArturReasoningProvider,
  DailyNarrativeInput,
  DailyNarrativeOutput,
  WeeklyAnalysisInput,
  WeeklyAnalysisOutput,
} from "./model-provider";
import type { ProblemOfTheWeek, WeeklyInitiative } from "../types";

export class MockArturReasoningProvider implements ArturReasoningProvider {
  readonly providerName = "mock";
  readonly modelId = "mock-deterministic";

  async draftDailyNarrative(input: DailyNarrativeInput): Promise<DailyNarrativeOutput> {
    const { snapshot } = input;
    const keyEvents: string[] = [];
    if (snapshot.finance.discrepancyCount > 0) {
      keyEvents.push(`${snapshot.finance.discrepancyCount} treasury transaction(s) still need manual reconciliation.`);
    }
    if (snapshot.complaints.criticalOpen > 0) {
      keyEvents.push(`${snapshot.complaints.criticalOpen} critical complaint case(s) remain open.`);
    }
    if (snapshot.cargo.criticalShipments > 0) {
      keyEvents.push(`${snapshot.cargo.criticalShipments} cargo incident(s) at HIGH/CRITICAL severity.`);
    }
    if (input.openIncidentCount > 0) {
      keyEvents.push(`${input.openIncidentCount} emergency incident(s) currently open.`);
    }

    const risksToday: string[] = [];
    if (input.stuckCasesCount > 0) risksToday.push(`${input.stuckCasesCount} case(s) exceeding normal handling time.`);
    if (snapshot.finance.unresolvedCasesCount > 0) risksToday.push(`${snapshot.finance.unresolvedCasesCount} unresolved accountant case(s) carry financial risk if not closed soon.`);

    return {
      keyEvents,
      passengerSummary: `${snapshot.passenger.requests} request(s), ${snapshot.passenger.completedTrips} completed trip(s), ${snapshot.passenger.cancellations} cancellation(s).`,
      cargoSummary: `${snapshot.cargo.accepted} shipment(s) accepted, ${snapshot.cargo.completed} completed, ${snapshot.cargo.delayedOrFailed} delayed/failed.`,
      financeSummary: `${snapshot.finance.incomingSom} som incoming, ${snapshot.finance.verifiedSom} som verified, ${snapshot.finance.discrepancyCount} discrepancy(ies).`,
      complaintsSummary: `${snapshot.complaints.opened} opened, ${snapshot.complaints.resolved} resolved, ${snapshot.complaints.criticalOpen} critical still open.`,
      risksToday,
    };
  }

  async draftWeeklyAnalysis(input: WeeklyAnalysisInput): Promise<WeeklyAnalysisOutput> {
    const declines = input.kpis.filter((k) => k.status === "DECLINE");
    const growths = input.kpis.filter((k) => k.status === "GROWTH");

    const problems: ProblemOfTheWeek[] = declines.map((k) => ({
      problem: `${k.name} declined week over week.`,
      category: "operational",
      evidence: `Previous week ${k.previousWeek}, current week ${k.currentWeek} (${k.percentageChange === null ? "no comparable baseline" : `${k.percentageChange.toFixed(1)}%`}).`,
      rootCause: null,
      businessImpact: "Lower throughput in this metric reduces overall RT volume/revenue for the week.",
      responsibleDomain: k.name,
      severity: "ATTENTION",
      recurring: false,
      currentResponse: "Under observation by Artur; no automated corrective action taken (spec s.28 default: recommendation only).",
      recommendedNextAction: `Review ${k.name.toLowerCase()} operational data for this week's root cause.`,
    }));

    const summaryParts = [
      growths.length > 0 ? `${growths.length} metric(s) grew week over week.` : null,
      declines.length > 0 ? `${declines.length} metric(s) declined week over week.` : null,
      growths.length === 0 && declines.length === 0 ? "All tracked metrics were stable week over week." : null,
    ].filter((p): p is string => Boolean(p));

    const initiatives: WeeklyInitiative[] = this.buildThreeInitiatives(input);

    return {
      executiveSummary: summaryParts.join(" ") || "NORMAL. No material deviations this week.",
      problems,
      initiatives,
    };
  }

  private buildThreeInitiatives(input: WeeklyAnalysisInput): WeeklyInitiative[] {
    const candidates: WeeklyInitiative[] = [
      {
        title: "Reduce treasury manual-reconciliation backlog",
        proposal: "Investigate the top recurring reference-mismatch pattern in unmatched transactions and adjust Sapargul's payment-reference prompt accordingly.",
        whyNow: `Current week discrepancy count: ${input.currentSnapshot.finance.discrepancyCount}.`,
        evidence: `finance.discrepancyCount=${input.currentSnapshot.finance.discrepancyCount}, unresolvedCasesCount=${input.currentSnapshot.finance.unresolvedCasesCount}.`,
        expectedEffect: "Fewer manual reconciliations per week, faster payment confirmation for cargo customers.",
        complexity: "LOW — prompt/process adjustment, no schema change.",
        resources: null,
        risks: "None to financial boundaries — Tyyin's inbound-only invariant is unaffected.",
        priority: input.currentSnapshot.finance.discrepancyCount > 0 ? "MEDIUM" : "LOW",
        successMetric: "Week-over-week decrease in finance.discrepancyCount.",
      },
      {
        title: "Review cargo incident response time",
        proposal: "Audit HIGH/CRITICAL ShipmentIncident cases from this week for time-to-resolution and identify the slowest-responding delivery executor segment.",
        whyNow: `Current week critical cargo incidents: ${input.currentSnapshot.cargo.criticalShipments}.`,
        evidence: `cargo.criticalShipments=${input.currentSnapshot.cargo.criticalShipments}, cargo.delayedOrFailed=${input.currentSnapshot.cargo.delayedOrFailed}.`,
        expectedEffect: "Faster incident resolution, fewer delayed/failed shipments next week.",
        complexity: "LOW — reporting/analysis only this week, no system change proposed yet.",
        resources: null,
        risks: "None — Sapar/Sapargul operational ownership is unaffected; Artur only observes.",
        priority: input.currentSnapshot.cargo.criticalShipments > 0 ? "MEDIUM" : "LOW",
        successMetric: "Week-over-week decrease in cargo.criticalShipments.",
      },
      {
        title: "Review open complaint aging",
        proposal: "Ask Adilet's queue owner to prioritize the oldest open CRITICAL complaint cases first, and confirm none are past the internal SLA.",
        whyNow: `Current week critical open complaints: ${input.currentSnapshot.complaints.criticalOpen}.`,
        evidence: `complaints.criticalOpen=${input.currentSnapshot.complaints.criticalOpen}, complaints.opened=${input.currentSnapshot.complaints.opened}, complaints.resolved=${input.currentSnapshot.complaints.resolved}.`,
        expectedEffect: "Lower average case age for critical complaints, reduced reputational risk.",
        complexity: "LOW — prioritization guidance only, Adilet retains sole decision authority.",
        resources: null,
        risks: "None — this does not override Adilet's independent arbitration authority.",
        priority: input.currentSnapshot.complaints.criticalOpen > 0 ? "HIGH" : "LOW",
        successMetric: "Week-over-week decrease in complaints.criticalOpen.",
      },
    ];

    // Only three candidates exist in the mock deck, so a repeated-title
    // filter could drop below 3 — in that case fall back to the full deck
    // rather than ever emitting fewer than 3 (spec s.15's hard invariant).
    const fresh = candidates.filter((c) => !input.recentInitiativeTitles.includes(c.title));
    return fresh.length === 3 ? fresh : candidates;
  }
}
