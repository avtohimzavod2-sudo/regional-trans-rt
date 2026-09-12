import { describe, expect, it } from "vitest";
import { isDryRunRecipient, screenOutboundSend } from "./send-gate";
import { scenarioWithSink } from "@/lib/testing/outbound-sink";
import { runInScenario, ScenarioSuppressedSendError } from "@/lib/testing/scenario-context";
import { syntheticId, SyntheticRecipientError } from "@/lib/testing/synthetic";

const SYNTHETIC = syntheticId("wa", "gate-1");
const REAL = "996700112233";

function withSink() {
  return scenarioWithSink({ testRunId: "send-gate", scenarioId: "send-gate-1" });
}

describe("outbound send gate", () => {
  it("records a synthetic recipient instead of sending, inside a scenario with a sink", async () => {
    const { context, sink } = withSink();

    const screening = await runInScenario(context, async () =>
      screenOutboundSend("WhatsApp", SYNTHETIC, "your driver is on the way"),
    );

    expect(screening).toBe("RECORDED_DRY_RUN");
    expect(sink.count()).toBe(1);
    expect(sink.to(SYNTHETIC)[0]?.text).toBe("your driver is on the way");
    expect(sink.all()[0]?.scenarioId).toBe("send-gate-1");
  });

  it("still refuses a real recipient inside a scenario that has a sink", async () => {
    // The property that makes a recorded send honest: the sink is a diversion
    // for messages that could never have reached a person, not a mute button
    // for messages that could.
    const { context, sink } = withSink();

    await runInScenario(context, async () => {
      expect(() => screenOutboundSend("WhatsApp", REAL, "hello")).toThrow(ScenarioSuppressedSendError);
    });

    expect(sink.count()).toBe(0);
  });

  it("refuses everything inside a scenario with no sink, as before the sink existed", async () => {
    await runInScenario({ testRunId: "send-gate", scenarioId: "no-sink" }, async () => {
      expect(() => screenOutboundSend("Telegram", SYNTHETIC, "hi")).toThrow(ScenarioSuppressedSendError);
      expect(() => screenOutboundSend("Telegram", REAL, "hi")).toThrow(ScenarioSuppressedSendError);
    });
  });

  it("refuses a synthetic recipient outside any scenario", () => {
    // A synthetic driver row outliving its scenario — swept by the offer
    // expiry job, or clicked by a dispatcher — must not be messaged just
    // because no scenario context happens to be active.
    expect(() => screenOutboundSend("Telegram", SYNTHETIC, "hi")).toThrow(SyntheticRecipientError);
  });

  it("proceeds for a real recipient outside a scenario", () => {
    expect(screenOutboundSend("WhatsApp", REAL, "hi")).toBe("PROCEED");
  });

  it("reports the dry-run branch only where it actually applies", async () => {
    const { context } = withSink();

    expect(isDryRunRecipient(SYNTHETIC)).toBe(false);
    await runInScenario(context, async () => {
      expect(isDryRunRecipient(SYNTHETIC)).toBe(true);
      expect(isDryRunRecipient(REAL)).toBe(false);
    });
    await runInScenario({ testRunId: "send-gate", scenarioId: "no-sink" }, async () => {
      expect(isDryRunRecipient(SYNTHETIC)).toBe(false);
    });
  });

  it("carries the matchId through to the record, so a driver prompt is identifiable", async () => {
    const { context, sink } = withSink();

    await runInScenario(context, async () => {
      screenOutboundSend("Telegram", SYNTHETIC, "trip offer", "match-42");
      screenOutboundSend("Telegram", SYNTHETIC, "unrelated notice");
    });

    expect(sink.lastPrompt()?.matchId).toBe("match-42");
  });
});
