import { describe, expect, it } from "vitest";
import { isScenarioContext } from "./scenario-context";
import { runScenario, runScenarios } from "./scenario-runner";

describe("runScenario", () => {
  it("reports PASS with timing when the scenario completes without throwing", async () => {
    const result = await runScenario({ id: "s1", description: "ok scenario", run: async () => {} });

    expect(result).toMatchObject({ scenarioId: "s1", description: "ok scenario", status: "PASS" });
    expect(result.testRunId).toEqual(expect.any(String));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it("reports FAIL with the error message when the scenario throws, rather than propagating it", async () => {
    const result = await runScenario({
      id: "s2",
      description: "failing scenario",
      run: async () => {
        throw new Error("scenario assertion failed");
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.error).toBe("scenario assertion failed");
  });

  it("runs the scenario body inside an active scenario context", async () => {
    let observedInsideRun = false;
    await runScenario({
      id: "s3",
      description: "context check",
      run: async () => {
        observedInsideRun = isScenarioContext();
      },
    });

    expect(observedInsideRun).toBe(true);
    expect(isScenarioContext()).toBe(false);
  });
});

describe("runScenarios", () => {
  it("runs every scenario and summarizes pass/fail counts honestly", async () => {
    const batch = await runScenarios([
      { id: "pass-1", description: "passes", run: async () => {} },
      {
        id: "fail-1",
        description: "fails",
        run: async () => {
          throw new Error("nope");
        },
      },
      { id: "pass-2", description: "passes too", run: async () => {} },
    ]);

    expect(batch.summary).toEqual({ total: 3, passed: 2, failed: 1 });
    expect(batch.results.map((r) => r.status)).toEqual(["PASS", "FAIL", "PASS"]);
    expect(batch.batchId).toEqual(expect.any(String));
  });

  it("gives each scenario a distinct testRunId derived from the shared batchId", async () => {
    const batch = await runScenarios([
      { id: "a", description: "a", run: async () => {} },
      { id: "b", description: "b", run: async () => {} },
    ]);

    const [first, second] = batch.results;
    expect(first.testRunId).not.toBe(second.testRunId);
    expect(first.testRunId).toContain(batch.batchId);
    expect(second.testRunId).toContain(batch.batchId);
  });

  it("returns an empty-but-honest summary for an empty scenario list", async () => {
    const batch = await runScenarios([]);
    expect(batch.summary).toEqual({ total: 0, passed: 0, failed: 0 });
  });
});
