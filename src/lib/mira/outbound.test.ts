import { beforeEach, describe, expect, it, vi } from "vitest";

// Direct exercise of the outbound safety gate itself — every caller
// (matching/orchestrate.ts, matching/expiry.ts, agents/command.ts) mocks
// this module away entirely in its own tests, so without this file the gate
// (mode resolution, suppressed-send audit logging, LIVE pass-through) has
// zero direct coverage. Mirrors src/lib/acquisition/outreach-log.test.ts.
const { auditLogEntryCreateMock, sendTelegramMessageMock, sendWhatsAppTextMock, sendWhatsAppConfirmButtonsMock } = vi.hoisted(() => ({
  auditLogEntryCreateMock: vi.fn(),
  sendTelegramMessageMock: vi.fn(),
  sendWhatsAppTextMock: vi.fn(),
  sendWhatsAppConfirmButtonsMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { auditLogEntry: { create: auditLogEntryCreateMock } } }));
vi.mock("@/lib/messaging/telegram", () => ({
  confirmDeclineKeyboard: vi.fn(),
  sendTelegramMessage: sendTelegramMessageMock,
}));
vi.mock("@/lib/messaging/whatsapp", () => ({
  sendWhatsAppText: sendWhatsAppTextMock,
  sendWhatsAppConfirmButtons: sendWhatsAppConfirmButtonsMock,
}));

import { notifyDriverPrivately, notifyPassengerText, notifyPassengerWithConfirmButtons, resolveOutboundMode } from "./outbound";

describe("mira/outbound safety gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MIRA_OUTBOUND_MODE;
    auditLogEntryCreateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "log-1", ...data }));
  });

  it("defaults to DRY_RUN when MIRA_OUTBOUND_MODE is unset — never a fabricated LIVE send", () => {
    expect(resolveOutboundMode()).toBe("DRY_RUN");
  });

  it("defaults to DRY_RUN for an unrecognized mode value rather than defaulting to LIVE", () => {
    process.env.MIRA_OUTBOUND_MODE = "banana";
    expect(resolveOutboundMode()).toBe("DRY_RUN");
  });

  it("DRY_RUN mode suppresses a driver notification without touching the Telegram adapter", async () => {
    const outcome = await notifyDriverPrivately("tg-1", "hello");

    expect(outcome).toEqual({ status: "DRY_RUN" });
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
    expect(auditLogEntryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "mira.outbound.suppressed",
          entityId: "tg-1",
          details: { kind: "driver_private", channel: "TELEGRAM", mode: "DRY_RUN" },
        }),
      }),
    );
  });

  it("SANDBOX mode suppresses a passenger text without touching the WhatsApp adapter", async () => {
    process.env.MIRA_OUTBOUND_MODE = "SANDBOX";

    const outcome = await notifyPassengerText("wa-1", "hello");

    expect(outcome).toEqual({ status: "SANDBOX" });
    expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
    expect(auditLogEntryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ details: { kind: "passenger_text", channel: "WHATSAPP", mode: "SANDBOX" } }),
      }),
    );
  });

  it("SANDBOX mode suppresses a passenger confirm-buttons message without touching the WhatsApp adapter", async () => {
    process.env.MIRA_OUTBOUND_MODE = "SANDBOX";

    const outcome = await notifyPassengerWithConfirmButtons("wa-1", "hello", "match-1");

    expect(outcome).toEqual({ status: "SANDBOX" });
    expect(sendWhatsAppConfirmButtonsMock).not.toHaveBeenCalled();
  });

  it("LIVE mode passes a driver notification through to the real Telegram adapter", async () => {
    process.env.MIRA_OUTBOUND_MODE = "LIVE";
    sendTelegramMessageMock.mockResolvedValue({ message_id: 1 });

    const outcome = await notifyDriverPrivately("tg-1", "hello");

    expect(outcome).toEqual({ message_id: 1 });
    expect(sendTelegramMessageMock).toHaveBeenCalledWith("tg-1", "hello", undefined);
    expect(auditLogEntryCreateMock).not.toHaveBeenCalled();
  });

  it("LIVE mode passes a passenger text through to the real WhatsApp adapter", async () => {
    process.env.MIRA_OUTBOUND_MODE = "LIVE";
    sendWhatsAppTextMock.mockResolvedValue(undefined);

    await notifyPassengerText("wa-1", "hello");

    expect(sendWhatsAppTextMock).toHaveBeenCalledWith("wa-1", "hello");
    expect(auditLogEntryCreateMock).not.toHaveBeenCalled();
  });

  it("LIVE mode still propagates a real adapter failure rather than swallowing it", async () => {
    process.env.MIRA_OUTBOUND_MODE = "LIVE";
    sendTelegramMessageMock.mockRejectedValue(new Error("bot blocked"));

    await expect(notifyDriverPrivately("tg-1", "hello")).rejects.toThrow("bot blocked");
  });
});
