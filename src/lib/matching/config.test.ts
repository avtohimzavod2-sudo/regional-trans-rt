import { afterEach, describe, expect, it } from "vitest";
import { getDriverResponseTimeoutMinutes, getPassengerResponseTimeoutMinutes } from "./config";

const ENV_KEYS = ["MATCH_DRIVER_RESPONSE_TIMEOUT_MINUTES", "MATCH_PASSENGER_RESPONSE_TIMEOUT_MINUTES"];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("Matching config defaults", () => {
  it("falls back to safe defaults when nothing is configured", () => {
    expect(getDriverResponseTimeoutMinutes()).toBe(15);
    expect(getPassengerResponseTimeoutMinutes()).toBe(15);
  });

  it("reads a valid override from the environment", () => {
    process.env.MATCH_DRIVER_RESPONSE_TIMEOUT_MINUTES = "10";
    process.env.MATCH_PASSENGER_RESPONSE_TIMEOUT_MINUTES = "20";
    expect(getDriverResponseTimeoutMinutes()).toBe(10);
    expect(getPassengerResponseTimeoutMinutes()).toBe(20);
  });

  it("rejects a non-numeric override and falls back to default", () => {
    process.env.MATCH_DRIVER_RESPONSE_TIMEOUT_MINUTES = "soon";
    expect(getDriverResponseTimeoutMinutes()).toBe(15);
  });

  it("rejects a zero or negative override", () => {
    process.env.MATCH_PASSENGER_RESPONSE_TIMEOUT_MINUTES = "-5";
    expect(getPassengerResponseTimeoutMinutes()).toBe(15);
  });
});
