// The RT Kyrgyz Benchmark runner. Runs BENCHMARK_CASES through the same
// injection-check -> understand -> reply path handleMiraInbound uses (see
// orchestrator.ts), scores each case, aggregates KPIs, persists a
// MiraBenchmarkRun/MiraBenchmarkResult[] row set, and records a
// MiraCertification decision. Never returns/writes CERTIFIED or
// PRODUCTION_APPROVED — see certification.ts for why.
import { db } from "@/lib/db";
import { detectMiraLanguage } from "../language/detect";
import { getMiraModelProvider, type MiraModelProvider } from "../providers/model-provider";
import { quickClassifyMessage } from "@/lib/agents/quick-classify";
import { detectInjectionAttempt, safetyRefusalText } from "../safety";
import { BENCHMARK_CASES, type BenchmarkCase } from "./benchmark-cases";
import { scoreCase, type ActualCaseOutput, type CaseScoreResult } from "./scoring";
import { computeKpiSummary, type KpiSummary } from "./kpi";
import { decideCertificationStatus } from "./certification";

export interface BenchmarkRunOutcome {
  runId: string | null;
  provider: string;
  model: string;
  scores: CaseScoreResult[];
  summary: KpiSummary;
  certification: ReturnType<typeof decideCertificationStatus>;
}

async function runOneCase(provider: MiraModelProvider, bCase: BenchmarkCase): Promise<CaseScoreResult> {
  const detection = detectMiraLanguage(bCase.input);

  if (detectInjectionAttempt(bCase.input)) {
    const actual: ActualCaseOutput = { language: detection.language, replyText: safetyRefusalText(detection.language) };
    return scoreCase(bCase, actual);
  }

  const quick = quickClassifyMessage(bCase.input);
  const understanding = await provider.understand({
    text: bCase.input,
    quickRole: quick.role,
    quickIntent: quick.intent,
    detectedLanguage: detection.language,
    languageConfidence: detection.confidence,
  });
  const replyOut = await provider.reply({
    language: detection.language,
    situation: "RT Kyrgyz Benchmark evaluation turn",
    userText: bCase.input,
  });

  const actual: ActualCaseOutput = {
    role: understanding.role,
    intent: understanding.intent,
    language: detection.language,
    normalizedData: understanding.entities,
    replyText: replyOut.text,
  };
  return scoreCase(bCase, actual);
}

/** persist: false (the default in tests) skips all DB writes so this stays
 * runnable in CI without a database. The dispatcher UI's "run benchmark"
 * action should pass persist: true. */
export async function runBenchmark(
  options: { cases?: BenchmarkCase[]; provider?: MiraModelProvider; persist?: boolean } = {},
): Promise<BenchmarkRunOutcome> {
  const cases = options.cases ?? BENCHMARK_CASES;
  const provider = options.provider ?? getMiraModelProvider();
  const persist = options.persist ?? false;

  const scores: CaseScoreResult[] = [];
  for (const bCase of cases) {
    scores.push(await runOneCase(provider, bCase));
  }

  const summary = computeKpiSummary(scores);
  const certification = decideCertificationStatus(summary);

  let runId: string | null = null;
  if (persist) {
    const run = await db.miraBenchmarkRun.create({
      data: {
        provider: provider.providerName,
        model: provider.modelId,
        finishedAt: new Date(),
        totalCases: summary.totalCases,
        passedCases: summary.passedCases,
        roleAccuracy: summary.roleAccuracy,
        routeAccuracy: summary.routeAccuracy,
        dateTimeAccuracy: summary.dateTimeAccuracy,
        seatAccuracy: summary.seatAccuracy,
        phoneAccuracy: summary.phoneAccuracy,
        hallucinationCount: summary.hallucinationCount,
        overallScore: summary.overallScore,
      },
    });
    runId = run.id;

    const dbCases = await db.miraBenchmarkCase.findMany({ where: { code: { in: cases.map((c) => c.code) } } });
    const caseIdByCode = new Map(dbCases.map((c) => [c.code, c.id]));

    for (const score of scores) {
      const caseId = caseIdByCode.get(score.code);
      if (!caseId) continue; // benchmark case not yet seeded into the DB — skip persisting this result
      await db.miraBenchmarkResult.create({
        data: {
          runId: run.id,
          caseId,
          passed: score.passed,
          failureCategory: score.failureCategories[0],
          details: { failureCategories: score.failureCategories },
        },
      });
    }

    await db.miraCertification.create({
      data: {
        status: certification.status,
        benchmarkRunId: run.id,
        roleAccuracy: summary.roleAccuracy,
        routeAccuracy: summary.routeAccuracy,
        dateTimeAccuracy: summary.dateTimeAccuracy,
        seatAccuracy: summary.seatAccuracy,
        phoneAccuracy: summary.phoneAccuracy,
        hallucinationRate: summary.hallucinationRate,
        notes: certification.reason,
      },
    });
  }

  return { runId, provider: provider.providerName, model: provider.modelId, scores, summary, certification };
}
