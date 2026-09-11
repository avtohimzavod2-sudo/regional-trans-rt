// Adversarial SideEffectGateway proof (hardening sprint s.3/s.4/s.15).
// Exercises the REAL, unmocked mira/outbound.ts -> messaging/telegram.ts /
// messaging/whatsapp.ts chain, and the real acquisition/outreach-log.ts ->
// acquisition/adapters.ts -> messaging/* chain, with only the true external
// boundaries stubbed: grammy's Bot class, global fetch, and @/lib/db. Every
// scenario below deliberately misconfigures MIRA_OUTBOUND_MODE and/or
// ACQUISITION_OUTREACH_MODE to LIVE — the point is proving the scenario
// context (scenario-context.ts) still blocks every real send even when the
// higher-level env-var gate is wrong, because the check lives one layer
// below those gates, at the lowest common boundary. A final control
// scenario proves the opposite direction too: the same LIVE call, run
// OUTSIDE any scenario context, does reach the mocked transport — so this
// file can't accidentally "pass" by having silently broken LIVE mode
// altogether.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMessageMock, fetchMock, dbMocks } = vi.hoisted(() => ({
  sendMessageMock: vi.fn().mockResolvedValue({ message_id: 1 }),
  fetchMock: vi.fn(),
  dbMocks: {
    acquisitionOutreachEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock("grammy", () => ({
  Bot: vi.fn().mockImplementation(() => ({ api: { sendMessage: sendMessageMock } })),
  InlineKeyboard: vi.fn().mockImplementation(() => ({ text: vi.fn().mockReturnThis() })),
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));

import { sendAcquisitionOutreach } from "@/lib/acquisition/outreach-log";
import { notifyDriverPrivately, notifyPassengerText, notifyPassengerWithConfirmButtons } from "@/lib/mira/outbound";
import { sendTelegramDirectMessage, sendTelegramMessage } from "@/lib/messaging/telegram";
import { sendWhatsAppText } from "@/lib/messaging/whatsapp";
import { makeDriver, makePassenger } from "@/lib/testing/factories";
import { runScenarios } from "@/lib/testing/scenario-runner";

const ORIGINAL_ENV = { ...process.env };

describe("SideEffectGateway cold-audit scenario batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}), text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    dbMocks.acquisitionOutreachEvent.findFirst.mockResolvedValue(null);
    dbMocks.acquisitionOutreachEvent.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "evt-1",
      ...data,
    }));
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
    process.env.WHATSAPP_ACCESS_TOKEN = "test-access-token";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("blocks every real send surface under an active scenario context, even with every mode misconfigured to LIVE — and reports an honest all-PASS batch", async () => {
    process.env.MIRA_OUTBOUND_MODE = "LIVE";
    process.env.ACQUISITION_OUTREACH_MODE = "LIVE";

    const driver = makeDriver();
    const passenger = makePassenger();

    const batch = await runScenarios([
      {
        id: "outbound-driver-notify-suppressed",
        description: "mira/outbound.notifyDriverPrivately never reaches grammy under scenario context, despite MIRA_OUTBOUND_MODE=LIVE",
        run: async () => {
          await expect(notifyDriverPrivately(driver.telegramUserId, "hello")).rejects.toThrow("scenario context");
          expect(sendMessageMock).not.toHaveBeenCalled();
        },
      },
      {
        id: "outbound-passenger-text-suppressed",
        description: "mira/outbound.notifyPassengerText never reaches the WhatsApp API under scenario context, despite MIRA_OUTBOUND_MODE=LIVE",
        run: async () => {
          await expect(notifyPassengerText(passenger.whatsappId, "hello")).rejects.toThrow("scenario context");
          expect(fetchMock).not.toHaveBeenCalled();
        },
      },
      {
        id: "outbound-passenger-confirm-buttons-suppressed",
        description: "mira/outbound.notifyPassengerWithConfirmButtons never reaches the WhatsApp API under scenario context",
        run: async () => {
          await expect(notifyPassengerWithConfirmButtons(passenger.whatsappId, "hello", "match-1")).rejects.toThrow("scenario context");
          expect(fetchMock).not.toHaveBeenCalled();
        },
      },
      {
        id: "acquisition-outreach-whatsapp-suppressed",
        description: "sendAcquisitionOutreach over WhatsApp honestly reports FAILED — never a fabricated SENT — under scenario context, despite ACQUISITION_OUTREACH_MODE=LIVE",
        run: async () => {
          const outcome = await sendAcquisitionOutreach({
            contractorAgent: "PASSENGER_CONTRACTOR",
            prospectType: "PASSENGER",
            prospectRef: "p-1",
            channel: "WHATSAPP",
            sourceType: "TELEGRAM_GROUP",
            sourceRef: null,
            to: passenger.whatsappId,
            text: "hello",
            idempotencyKey: "scenario:acquisition:whatsapp:p-1",
          });
          expect(outcome.status).toBe("FAILED");
          expect(fetchMock).not.toHaveBeenCalled();
        },
      },
      {
        id: "acquisition-outreach-telegram-suppressed",
        description: "sendAcquisitionOutreach over Telegram honestly reports FAILED — never a fabricated SENT — under scenario context, despite ACQUISITION_OUTREACH_MODE=LIVE",
        run: async () => {
          const outcome = await sendAcquisitionOutreach({
            contractorAgent: "DRIVER_CONTRACTOR",
            prospectType: "BUSINESS",
            prospectRef: "b-1",
            channel: "TELEGRAM_BOT",
            sourceType: "TELEGRAM_GROUP",
            sourceRef: null,
            to: "999",
            text: "hello",
            idempotencyKey: "scenario:acquisition:telegram:b-1",
          });
          expect(outcome.status).toBe("FAILED");
          expect(sendMessageMock).not.toHaveBeenCalled();
        },
      },
      {
        id: "raw-ungated-caller-still-suppressed",
        description: "a caller that bypasses mira/outbound.ts entirely and calls the raw messaging functions directly (as mira/orchestrator.ts and src/lib/ingest.ts already do) is still caught by the lowest-level gate",
        run: async () => {
          await expect(sendTelegramMessage(driver.telegramUserId, "hi")).rejects.toThrow("scenario context");
          await expect(sendTelegramDirectMessage(driver.telegramUserId, "hi")).resolves.toBe(false);
          await expect(sendWhatsAppText(passenger.whatsappId, "hi")).rejects.toThrow("scenario context");
          expect(sendMessageMock).not.toHaveBeenCalled();
          expect(fetchMock).not.toHaveBeenCalled();
        },
      },
    ]);

    expect(batch.summary).toEqual({ total: 6, passed: 6, failed: 0 });
  });

  it("control: the identical LIVE call reaches the mocked transport OUTSIDE any scenario context, proving the gate is scenario-specific rather than having silently broken LIVE mode", async () => {
    process.env.MIRA_OUTBOUND_MODE = "LIVE";

    await notifyDriverPrivately(makeDriver().telegramUserId, "hello outside any scenario");

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });
});
