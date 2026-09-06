import { describe, expect, it } from "vitest";
import { decideRoute } from "./command";
import type { QuickClassification } from "./quick-classify";

function classification(overrides: Partial<QuickClassification>): QuickClassification {
  return { role: "unknown", intent: "unrecognized", confidence: 0, matchedSignals: [], ...overrides };
}

describe("decideRoute", () => {
  it("attempts a cancellation lookup regardless of channel when intent is cancellation", () => {
    expect(decideRoute("WHATSAPP", classification({ intent: "cancellation" }))).toEqual({ kind: "ATTEMPT_CANCELLATION_THEN_INGEST" });
    expect(decideRoute("TELEGRAM_BOT", classification({ intent: "cancellation" }))).toEqual({ kind: "ATTEMPT_CANCELLATION_THEN_INGEST" });
    expect(decideRoute("TELEGRAM_GROUP", classification({ intent: "cancellation" }))).toEqual({ kind: "ATTEMPT_CANCELLATION_THEN_INGEST" });
  });

  it("routes WhatsApp messages to the passenger ingest path", () => {
    expect(decideRoute("WHATSAPP", classification({ role: "passenger", intent: "trip_request" }))).toEqual({ kind: "INGEST_PASSENGER" });
  });

  it("routes Telegram private messages to the driver ingest path", () => {
    expect(decideRoute("TELEGRAM_BOT", classification({ role: "driver", intent: "trip_offer" }))).toEqual({ kind: "INGEST_DRIVER" });
  });

  it("skips zero-confidence unrecognized group chatter without touching the LLM", () => {
    expect(decideRoute("TELEGRAM_GROUP", classification({ confidence: 0, intent: "unrecognized" }))).toEqual({ kind: "SKIP_GROUP_MESSAGE" });
  });

  it("still ingests group messages that have some signal, even if not fully confident", () => {
    expect(decideRoute("TELEGRAM_GROUP", classification({ role: "driver", intent: "trip_offer", confidence: 0.5 }))).toEqual({ kind: "INGEST_GROUP" });
  });
});
