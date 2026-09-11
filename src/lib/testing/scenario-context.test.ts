import { describe, expect, it } from "vitest";
import { currentScenarioContext, isScenarioContext, runInScenario, ScenarioSuppressedSendError } from "./scenario-context";

describe("scenario-context", () => {
  it("reports no active context outside of runInScenario", () => {
    expect(isScenarioContext()).toBe(false);
    expect(currentScenarioContext()).toBeUndefined();
  });

  it("reports an active context inside runInScenario, scoped to that call", async () => {
    await runInScenario({ testRunId: "run-1", scenarioId: "scn-1" }, async () => {
      expect(isScenarioContext()).toBe(true);
      expect(currentScenarioContext()).toEqual({ testRunId: "run-1", scenarioId: "scn-1" });
    });
    expect(isScenarioContext()).toBe(false);
  });

  it("propagates the context across nested awaits and macrotask boundaries", async () => {
    await runInScenario({ testRunId: "run-2", scenarioId: "scn-2" }, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(currentScenarioContext()?.scenarioId).toBe("scn-2");
    });
  });

  it("does not leak context between two sequential scenario runs", async () => {
    await runInScenario({ testRunId: "a", scenarioId: "a" }, async () => {});
    expect(isScenarioContext()).toBe(false);
    await runInScenario({ testRunId: "b", scenarioId: "b" }, async () => {
      expect(currentScenarioContext()?.scenarioId).toBe("b");
    });
  });

  it("restores the outer context even when the scenario throws", async () => {
    await expect(
      runInScenario({ testRunId: "c", scenarioId: "c" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(isScenarioContext()).toBe(false);
  });

  it("keeps two concurrently running scenarios' contexts isolated from each other", async () => {
    const seenInX: (string | undefined)[] = [];
    const seenInY: (string | undefined)[] = [];
    await Promise.all([
      runInScenario({ testRunId: "x", scenarioId: "x" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        seenInX.push(currentScenarioContext()?.scenarioId);
      }),
      runInScenario({ testRunId: "y", scenarioId: "y" }, async () => {
        seenInY.push(currentScenarioContext()?.scenarioId);
      }),
    ]);
    expect(seenInX).toEqual(["x"]);
    expect(seenInY).toEqual(["y"]);
  });

  it("ScenarioSuppressedSendError names the channel that was suppressed", () => {
    const error = new ScenarioSuppressedSendError("WhatsApp");
    expect(error.name).toBe("ScenarioSuppressedSendError");
    expect(error.message).toContain("WhatsApp");
  });
});
