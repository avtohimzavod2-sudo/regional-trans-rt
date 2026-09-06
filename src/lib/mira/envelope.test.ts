import { describe, expect, it } from "vitest";
import { buildInboundEnvelope } from "./envelope";
import { detectMiraLanguage } from "./language/detect";
import type { MiraUnderstandOutput } from "./providers/model-provider";

const understanding: MiraUnderstandOutput = {
  role: "DRIVER",
  roleConfidence: 0.9,
  intent: "trip_offer",
  intentConfidence: 0.9,
  entities: { from: "BISHKEK", to: "KARAKOL", date: "TOMORROW", seatsAvailable: 3 },
  uncertainties: [],
  requiresClarification: false,
  clarificationQuestion: null,
};

describe("buildInboundEnvelope", () => {
  it("assembles a full MiraInboundEnvelope from detection + understanding", () => {
    const detection = detectMiraLanguage("Эртен Бишкектен Караколго 7де кетем 3 орун бар");
    const envelope = buildInboundEnvelope({
      channel: "TELEGRAM_BOT",
      conversationId: "conv_1",
      externalUserId: "user_1",
      rawText: "Эртен Бишкектен Караколго 7де кетем 3 орун бар",
      detection,
      understanding,
      traceId: "rt_test",
    });

    expect(envelope.role).toBe("DRIVER");
    expect(envelope.language).toBe("KY");
    expect(envelope.entities.from).toBe("BISHKEK");
    expect(envelope.normalizedRequest).toBe(envelope.entities);
    expect(envelope.requiresClarification).toBe(false);
    expect(envelope.traceId).toBe("rt_test");
  });

  it("carries requiresClarification through from understanding", () => {
    const detection = detectMiraLanguage("Мне нужно место в Каракол");
    const envelope = buildInboundEnvelope({
      channel: "WHATSAPP",
      conversationId: "conv_2",
      externalUserId: "user_2",
      rawText: "Мне нужно место в Каракол",
      detection,
      understanding: { ...understanding, requiresClarification: true, uncertainties: ["date"] },
    });

    expect(envelope.requiresClarification).toBe(true);
    expect(envelope.uncertainties).toContain("date");
  });
});
