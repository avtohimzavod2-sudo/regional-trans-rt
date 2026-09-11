// Scenario/simulation harness (hardening sprint s.3/s.15): runs a named
// scenario inside the SideEffectGateway's scenario context (see
// scenario-context.ts) and reports an honest PASS/FAIL outcome rather than
// letting a thrown error crash the batch. Every result carries the
// testRunId/scenarioId markers the sprint requires for traceability.
import { randomUUID } from "node:crypto";
import { runInScenario } from "./scenario-context";

export interface ScenarioDefinition {
  id: string;
  description: string;
  run: () => Promise<void>;
}

export interface ScenarioResult {
  scenarioId: string;
  description: string;
  testRunId: string;
  status: "PASS" | "FAIL";
  durationMs: number;
  error?: string;
}

export async function runScenario(scenario: ScenarioDefinition, testRunId: string = randomUUID()): Promise<ScenarioResult> {
  const start = Date.now();
  try {
    await runInScenario({ testRunId, scenarioId: scenario.id }, scenario.run);
    return { scenarioId: scenario.id, description: scenario.description, testRunId, status: "PASS", durationMs: Date.now() - start };
  } catch (err) {
    return {
      scenarioId: scenario.id,
      description: scenario.description,
      testRunId,
      status: "FAIL",
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface ScenarioBatchResult {
  batchId: string;
  results: ScenarioResult[];
  summary: { total: number; passed: number; failed: number };
}

/** Runs scenarios sequentially — deliberate, not an oversight: scenarios in
 * a batch commonly share one file's hoisted mock state (the same pattern
 * every existing *.test.ts in this repo already uses), and sequential
 * execution keeps that mock state deterministic between scenarios. */
export async function runScenarios(scenarios: ScenarioDefinition[]): Promise<ScenarioBatchResult> {
  const batchId = randomUUID();
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, `${batchId}:${scenario.id}`));
  }
  const passed = results.filter((r) => r.status === "PASS").length;
  return { batchId, results, summary: { total: results.length, passed, failed: results.length - passed } };
}
