import { afterEach, describe, expect, it } from "vitest";
import { currentPaymentEnvironment, PaymentDestinationNotConfiguredError } from "./destination";

const ORIGINAL_ENV = process.env.SAPARGUL_PAYMENT_ENV;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.SAPARGUL_PAYMENT_ENV;
  else process.env.SAPARGUL_PAYMENT_ENV = ORIGINAL_ENV;
});

describe("currentPaymentEnvironment", () => {
  // Scenario L/M: an unconfigured environment must default to SANDBOX, never
  // be silently treated as PRODUCTION.
  it("defaults to SANDBOX when SAPARGUL_PAYMENT_ENV is unset", () => {
    delete process.env.SAPARGUL_PAYMENT_ENV;
    expect(currentPaymentEnvironment()).toBe("SANDBOX");
  });

  it("defaults to SANDBOX for any value other than the exact string PRODUCTION", () => {
    process.env.SAPARGUL_PAYMENT_ENV = "production";
    expect(currentPaymentEnvironment()).toBe("SANDBOX");
    process.env.SAPARGUL_PAYMENT_ENV = "prod";
    expect(currentPaymentEnvironment()).toBe("SANDBOX");
  });

  it("returns PRODUCTION only when explicitly set to PRODUCTION", () => {
    process.env.SAPARGUL_PAYMENT_ENV = "PRODUCTION";
    expect(currentPaymentEnvironment()).toBe("PRODUCTION");
  });
});

describe("PaymentDestinationNotConfiguredError", () => {
  // Scenario M: no invented QR/requisites — this error is what callers must
  // surface instead of fabricating a destination.
  it("carries the environment in its message", () => {
    const err = new PaymentDestinationNotConfiguredError("PRODUCTION");
    expect(err.message).toContain("PRODUCTION");
    expect(err.name).toBe("PaymentDestinationNotConfiguredError");
  });
});
