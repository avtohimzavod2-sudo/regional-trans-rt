import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyWhatsAppSignature } from "./whatsapp";

const ORIGINAL_SECRET = process.env.WHATSAPP_APP_SECRET;

function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyWhatsAppSignature", () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [] } }] }] });

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = "test-app-secret";
  });

  afterEach(() => {
    process.env.WHATSAPP_APP_SECRET = ORIGINAL_SECRET;
  });

  it("accepts a correctly signed body", () => {
    const signature = sign("test-app-secret", body);
    expect(verifyWhatsAppSignature(body, signature)).toBe(true);
  });

  it("rejects when WHATSAPP_APP_SECRET is not configured (fail closed)", () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const signature = sign("test-app-secret", body);
    expect(verifyWhatsAppSignature(body, signature)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWhatsAppSignature(body, null)).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const signature = sign("some-other-secret", body);
    expect(verifyWhatsAppSignature(body, signature)).toBe(false);
  });

  it("rejects a signature for a different body (tampered payload)", () => {
    const signature = sign("test-app-secret", body);
    expect(verifyWhatsAppSignature(body + "tampered", signature)).toBe(false);
  });

  it("rejects a malformed scheme prefix", () => {
    const hex = createHmac("sha256", "test-app-secret").update(body, "utf8").digest("hex");
    expect(verifyWhatsAppSignature(body, `sha1=${hex}`)).toBe(false);
  });

  it("rejects a non-hex signature value", () => {
    expect(verifyWhatsAppSignature(body, `sha256=${"z".repeat(64)}`)).toBe(false);
  });

  it("rejects a truncated signature value", () => {
    const hex = createHmac("sha256", "test-app-secret").update(body, "utf8").digest("hex");
    expect(verifyWhatsAppSignature(body, `sha256=${hex.slice(0, 10)}`)).toBe(false);
  });
});
