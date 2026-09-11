import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { miraMocks } = vi.hoisted(() => ({
  miraMocks: {
    handleMiraInbound: vi.fn(),
    handleMiraMatchDecision: vi.fn(),
  },
}));
vi.mock("@/lib/mira/orchestrator", () => miraMocks);

import { POST } from "./route";

const ORIGINAL_SECRET = process.env.WHATSAPP_APP_SECRET;

function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function postRequest(body: string, signature?: string | null): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("x-hub-signature-256", signature);
  return new NextRequest("https://example.com/api/webhooks/whatsapp", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/webhooks/whatsapp", () => {
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ type: "text", from: "1", id: "m1", text: { body: "hi" } }] } }] }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_APP_SECRET = "test-app-secret";
  });

  afterEach(() => {
    process.env.WHATSAPP_APP_SECRET = ORIGINAL_SECRET;
  });

  it("rejects a request with no signature header before any side effect runs", async () => {
    const res = await POST(postRequest(body));
    expect(res.status).toBe(403);
    expect(miraMocks.handleMiraInbound).not.toHaveBeenCalled();
    expect(miraMocks.handleMiraMatchDecision).not.toHaveBeenCalled();
  });

  it("rejects a request signed with the wrong secret before any side effect runs", async () => {
    const res = await POST(postRequest(body, sign("wrong-secret", body)));
    expect(res.status).toBe(403);
    expect(miraMocks.handleMiraInbound).not.toHaveBeenCalled();
  });

  it("rejects every request when WHATSAPP_APP_SECRET is not configured (fail closed)", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const res = await POST(postRequest(body, sign("test-app-secret", body)));
    expect(res.status).toBe(403);
    expect(miraMocks.handleMiraInbound).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed request and dispatches to Mira", async () => {
    const res = await POST(postRequest(body, sign("test-app-secret", body)));
    expect(res.status).toBe(200);
    expect(miraMocks.handleMiraInbound).toHaveBeenCalledTimes(1);
  });
});
