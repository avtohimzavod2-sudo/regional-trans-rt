// Jolchu benchmark runner — mirrors src/lib/mira/training/benchmark.ts's
// shape (runOneCase -> score -> aggregate -> optionally persist), adapted for
// two case kinds: ROUTING_DECISION (pure, no I/O) and FULL_RESOLUTION (runs
// the real resolveRouteIntelligence() pipeline against injected mock/failing
// providers, never a live network call). persist:false (the default, and
// what CI/tests use) skips all database writes.
import { db } from "@/lib/db";
import { decideJolchuRouting } from "../routing-decision";
import { resolveRouteIntelligence } from "../orchestrator";
import { BENCHMARK_CASES, type JolchuBenchmarkCase } from "./benchmark-cases";

export interface JolchuCaseScoreResult {
  code: string;
  category: string;
  passed: boolean;
  failureCategories: string[];
  hallucinationDetected: boolean;
}

export interface JolchuKpiSummary {
  totalCases: number;
  passedCases: number;
  routingDecisionAccuracy: number | null;
  locationResolutionAccuracy: number | null;
  routeCalculationAccuracy: number | null;
  fallbackHandledCorrectly: number | null;
  hallucinationCount: number;
  overallScore: number;
}

function accuracyFor(scores: JolchuCaseScoreResult[], category: string): number | null {
  const inCategory = scores.filter((s) => s.category === category);
  if (inCategory.length === 0) return null;
  return inCategory.filter((s) => s.passed).length / inCategory.length;
}

export function computeJolchuKpiSummary(scores: JolchuCaseScoreResult[]): JolchuKpiSummary {
  const totalCases = scores.length;
  const passedCases = scores.filter((s) => s.passed).length;
  return {
    totalCases,
    passedCases,
    routingDecisionAccuracy: accuracyFor(scores, "ROUTING_DECISION"),
    locationResolutionAccuracy: accuracyFor(scores, "LOCATION_RESOLUTION"),
    routeCalculationAccuracy: accuracyFor(scores, "ROUTE_CALCULATION"),
    fallbackHandledCorrectly: accuracyFor(scores, "FALLBACK"),
    hallucinationCount: scores.filter((s) => s.hallucinationDetected).length,
    overallScore: totalCases > 0 ? passedCases / totalCases : 0,
  };
}

async function runOneCase(bCase: JolchuBenchmarkCase): Promise<JolchuCaseScoreResult> {
  const failures: string[] = [];
  let hallucinationDetected = false;

  if (bCase.kind === "ROUTING_DECISION") {
    const decision = decideJolchuRouting(bCase.rawInput);
    if (decision.required !== bCase.expectedJolchuRequired) failures.push("routing_required_mismatch");
    if (bCase.expectedJolchuRequired && decision.reasonCode !== bCase.expectedReasonCode) failures.push("reason_code_mismatch");
    return { code: bCase.code, category: bCase.category, passed: failures.length === 0, failureCategories: failures, hallucinationDetected };
  }

  const result = await resolveRouteIntelligence({
    reasonCode: bCase.request.reasonCode,
    origin: bCase.request.origin,
    destination: bCase.request.destination,
    waypoints: bCase.request.waypoints,
    deps: bCase.request.deps,
    persist: false,
  });

  if (result.status !== bCase.expectedStatus) failures.push("status_mismatch");

  if (bCase.expectedAmbiguity !== undefined && result.ambiguity !== bCase.expectedAmbiguity) {
    failures.push("ambiguity_mismatch");
  }
  if (
    bCase.expectedAmbiguityCandidateCount !== undefined &&
    (result.ambiguityCandidates?.length ?? 0) !== bCase.expectedAmbiguityCandidateCount
  ) {
    failures.push("ambiguity_candidate_count_mismatch");
  }
  if (bCase.expectedWaypointCount !== undefined && result.waypoints.length !== bCase.expectedWaypointCount) {
    failures.push("waypoint_count_mismatch");
  }
  if (bCase.expectedLastMileDetected !== undefined) {
    const actualDetected = result.route?.lastMile.detected ?? false;
    if (actualDetected !== bCase.expectedLastMileDetected) failures.push("last_mile_mismatch");
  }
  if (bCase.expectedTrafficStatus !== undefined && result.route?.trafficStatus !== bCase.expectedTrafficStatus) {
    failures.push("traffic_status_mismatch");
  }

  // Structural anti-hallucination check: on FAILED/NEEDS_CONFIRMATION cases,
  // Jolchu must never have silently produced a resolved route or a picked
  // ambiguous coordinate.
  if (bCase.expectedRouteHallucinationForbidden) {
    const anyAmbiguousLocationHasCoords = [result.origin, result.destination, ...result.waypoints]
      .filter((l) => l !== null)
      .some((l) => l!.ambiguity && l!.latitude !== null);
    if (result.route !== null && bCase.expectedStatus !== "RESOLVED") {
      hallucinationDetected = true;
      failures.push("fabricated_route_detected");
    }
    if (anyAmbiguousLocationHasCoords) {
      hallucinationDetected = true;
      failures.push("silently_resolved_ambiguous_location");
    }
  }

  return { code: bCase.code, category: bCase.category, passed: failures.length === 0, failureCategories: failures, hallucinationDetected };
}

export interface JolchuBenchmarkRunOutcome {
  runId: string | null;
  scores: JolchuCaseScoreResult[];
  summary: JolchuKpiSummary;
}

/** persist: false (the default) skips the detailed JolchuRequest/location/
 * route/provider-execution rows and the JolchuBenchmarkRun/Result rows.
 * FULL_RESOLUTION cases still go through the real orchestrator (so the
 * status-computation decision tree is exercised end to end), which always
 * writes one lightweight AuditLogEntry per request per the mandatory audit
 * trail — so a reachable database is required to run this suite either way.
 * Jolchu Center's "run benchmark" action should pass persist: true. */
export async function runJolchuBenchmark(
  options: { cases?: JolchuBenchmarkCase[]; persist?: boolean; modelProviderLabel?: string; routeProviderLabel?: string } = {},
): Promise<JolchuBenchmarkRunOutcome> {
  const cases = options.cases ?? BENCHMARK_CASES;
  const persist = options.persist ?? false;

  const scores: JolchuCaseScoreResult[] = [];
  for (const bCase of cases) {
    scores.push(await runOneCase(bCase));
  }

  const summary = computeJolchuKpiSummary(scores);

  let runId: string | null = null;
  if (persist) {
    const run = await db.jolchuBenchmarkRun.create({
      data: {
        modelProvider: options.modelProviderLabel ?? "mock",
        routeProvider: options.routeProviderLabel ?? "mock",
        finishedAt: new Date(),
        totalCases: summary.totalCases,
        passedCases: summary.passedCases,
        routingDecisionAccuracy: summary.routingDecisionAccuracy,
        locationResolutionAccuracy: summary.locationResolutionAccuracy,
        routeCalculationAccuracy: summary.routeCalculationAccuracy,
        fallbackHandledCorrectly: summary.fallbackHandledCorrectly,
        hallucinationCount: summary.hallucinationCount,
        overallScore: summary.overallScore,
      },
    });
    runId = run.id;

    const dbCases = await db.jolchuBenchmarkCase.findMany({ where: { code: { in: cases.map((c) => c.code) } } });
    const caseIdByCode = new Map(dbCases.map((c) => [c.code, c.id]));

    for (const score of scores) {
      const caseId = caseIdByCode.get(score.code);
      if (!caseId) continue; // benchmark case not yet seeded into the DB — skip persisting this result
      await db.jolchuBenchmarkResult.create({
        data: {
          runId: run.id,
          caseId,
          passed: score.passed,
          details: { failureCategories: score.failureCategories, hallucinationDetected: score.hallucinationDetected },
        },
      });
    }
  }

  return { runId, scores, summary };
}
