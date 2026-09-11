import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { telegramMocks, commandMocks, miraMocks, matchingMocks, dbMocks } = vi.hoisted(() => ({
  telegramMocks: { getTelegramBot: vi.fn() },
  commandMocks: { handleInboundMessage: vi.fn() },
  miraMocks: { handleMiraInbound: vi.fn() },
  matchingMocks: { handleDriverResponse: vi.fn() },
  dbMocks: { db: { telegramGroup: { findUnique: vi.fn() } } },
}));
vi.mock("@/lib/messaging/telegram", () => telegramMocks);
vi.mock("@/lib/agents/command", () => commandMocks);
vi.mock("@/lib/mira/orchestrator", () => miraMocks);
vi.mock("@/lib/matching/orchestrate", () => matchingMocks);
vi.mock("@/lib/db", () => dbMocks);

import { POST } from "./route";

const ORIGINAL_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

function postRequest(update: unknown, secretHeader?: string | null): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (secretHeader) headers.set("x-telegram-bot-api-secret-token", secretHeader);
  return new Request("https://example.com/api/webhooks/telegram", {
    method: "POST",
    headers,
    body: JSON.stringify(update),
  });
}

describe("POST /api/webhooks/telegram", () => {
  const update = {
    update_id: 1,
    message: { message_id: 1, chat: { id: 1, type: "private" }, from: { id: 1 }, text: "hi" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
  });

  afterEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  it("rejects a request with no secret header before the bot is even constructed", async () => {
    const res = await POST(postRequest(update));
    expect(res.status).toBe(401);
    expect(telegramMocks.getTelegramBot).not.toHaveBeenCalled();
    expect(miraMocks.handleMiraInbound).not.toHaveBeenCalled();
    expect(commandMocks.handleInboundMessage).not.toHaveBeenCalled();
    expect(matchingMocks.handleDriverResponse).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret header before the bot is even constructed", async () => {
    const res = await POST(postRequest(update, "not-the-real-secret"));
    expect(res.status).toBe(401);
    expect(telegramMocks.getTelegramBot).not.toHaveBeenCalled();
    expect(miraMocks.handleMiraInbound).not.toHaveBeenCalled();
  });

  it("rejects every request when TELEGRAM_WEBHOOK_SECRET is not configured (fail closed)", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const res = await POST(postRequest(update, "anything"));
    expect(res.status).toBe(401);
    expect(telegramMocks.getTelegramBot).not.toHaveBeenCalled();
  });
});
