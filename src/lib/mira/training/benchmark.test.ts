import { describe, expect, it } from "vitest";
import { runBenchmark } from "./benchmark";
import { MockMiraProvider } from "../providers/mock";
import { getBenchmarkCase } from "./benchmark-cases";

// persist defaults to false, so this never touches the database — safe to
// run in CI. The mock provider is deterministic, so this doubles as a
// sanity check that the full case -> understand/reply -> score pipeline
// wires together correctly end to end.
describe("runBenchmark (persist: false)", () => {
  it("runs the full benchmark against the mock provider without touching the database", async () => {
    const outcome = await runBenchmark({ provider: new MockMiraProvider() });
    expect(outcome.runId).toBeNull();
    expect(outcome.provider).toBe("mock");
    expect(outcome.scores.length).toBeGreaterThan(0);
    expect(outcome.summary.totalCases).toBe(outcome.scores.length);
    expect(["TRAINEE", "CERTIFICATION_PENDING"]).toContain(outcome.certification.status);
  });

  it("scores the easy literary driver-offer case as passed against the mock provider", async () => {
    const litCase = getBenchmarkCase("KY-LIT-001")!;
    const outcome = await runBenchmark({ provider: new MockMiraProvider(), cases: [litCase] });
    expect(outcome.scores[0].code).toBe("KY-LIT-001");
    expect(outcome.scores[0].roleCorrect).toBe(true);
  });

  it("blocks the injection-attempt adversarial case before it reaches the model provider", async () => {
    const injectCase = getBenchmarkCase("ADV-INJECT-001")!;
    const outcome = await runBenchmark({ provider: new MockMiraProvider(), cases: [injectCase] });
    expect(outcome.scores[0].passed).toBe(true);
  });
});
