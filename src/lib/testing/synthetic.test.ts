import { describe, expect, it } from "vitest";
import {
  assertRealRecipient,
  assertSyntheticContour,
  isSyntheticIdentifier,
  syntheticId,
  SyntheticContourError,
  SyntheticRecipientError,
  SYNTHETIC_MARKER,
} from "./synthetic";

describe("syntheticId", () => {
  it("produces an identifier that says what it is", () => {
    expect(syntheticId("passenger", 7)).toBe("SYNTHETIC-TEST-passenger-7");
  });

  it("cannot collide with a real WhatsApp id or Telegram user id", () => {
    // Both are numeric. A marker starting with a letter is unreachable for
    // them, which is the whole basis for putting it in the natural key.
    expect(SYNTHETIC_MARKER[0]).toMatch(/[A-Za-z]/);
    expect(isSyntheticIdentifier("996700123456")).toBe(false);
    expect(isSyntheticIdentifier("184722901")).toBe(false);
  });

  it("refuses to build an identifier that would not be recognizable", () => {
    expect(() => syntheticId("", "1")).toThrow(/non-empty/);
    expect(() => syntheticId("driver", "  ")).toThrow(/non-empty/);
  });
});

describe("isSyntheticIdentifier", () => {
  it("finds the marker anywhere, not only at the start", () => {
    // Identifiers get wrapped and composed on their way through RT:
    // "whatsapp:<id>", "MIRA_...:<conversationId>:<event>". A prefix-only check
    // would stop recognizing them exactly where the recognition matters.
    expect(isSyntheticIdentifier("whatsapp:SYNTHETIC-TEST-passenger-1")).toBe(true);
    expect(isSyntheticIdentifier("MIRA_PASSENGER_FINANCIAL_INTENT:SYNTHETIC-TEST-conv-3:baggage")).toBe(true);
  });

  it("treats absent and non-string values as real, never as synthetic", () => {
    // Fail closed in the direction that matters: an unknown recipient must be
    // treated as a real person, so the send is attempted and the normal
    // credential/mode gates decide. Guessing "synthetic" would suppress a real
    // message.
    expect(isSyntheticIdentifier(null)).toBe(false);
    expect(isSyntheticIdentifier(undefined)).toBe(false);
    expect(isSyntheticIdentifier("")).toBe(false);
  });
});

describe("assertRealRecipient", () => {
  it("refuses a synthetic recipient", () => {
    expect(() => assertRealRecipient("WhatsApp", syntheticId("passenger", 1))).toThrow(SyntheticRecipientError);
  });

  it("names the channel and the recipient, so the leak is traceable", () => {
    try {
      assertRealRecipient("Telegram", syntheticId("driver", "alpha"));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SyntheticRecipientError);
      expect((err as SyntheticRecipientError).channel).toBe("Telegram");
      expect((err as SyntheticRecipientError).recipient).toBe("SYNTHETIC-TEST-driver-alpha");
    }
  });

  it("lets a real recipient through", () => {
    expect(() => assertRealRecipient("WhatsApp", "996700123456")).not.toThrow();
  });
});

describe("assertSyntheticContour", () => {
  it("permits a local loopback database", () => {
    expect(() => assertSyntheticContour("postgresql://u:p@localhost:55432/regional_trans_rt_test")).not.toThrow();
  });

  it("refuses a managed database", () => {
    expect(() => assertSyntheticContour("postgresql://u:p@ep-x.neon.tech/neondb")).toThrow(SyntheticContourError);
  });

  it("refuses an unclassifiable database rather than assuming it is safe", () => {
    expect(() => assertSyntheticContour("postgresql://u:p@db.internal.example.com:5432/rt")).toThrow(
      SyntheticContourError,
    );
  });

  it("refuses when there is no database configured at all", () => {
    // Has to go through process.env, not through `assertSyntheticContour(undefined)`:
    // an explicit undefined argument selects the default parameter, so that
    // call reads DATABASE_URL and passes wherever one happens to be set. It
    // did pass locally on a shell with no DATABASE_URL, and failed on CI,
    // where the placeholder loopback URL is a perfectly valid contour.
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => assertSyntheticContour()).toThrow(/DATABASE_URL is not set/);
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });

  it("reads DATABASE_URL when called with no argument", () => {
    // The pairing that makes the test above meaningful: the default parameter
    // really is the process environment, so the deletion is what the refusal
    // is responding to.
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://u:p@ep-x.neon.tech/neondb";
    try {
      expect(() => assertSyntheticContour()).toThrow(SyntheticContourError);
      process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:5432/rt_test";
      expect(() => assertSyntheticContour()).not.toThrow();
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
});
