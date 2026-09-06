import { afterEach, describe, expect, it } from "vitest";
import {
  getConfirmationConfidenceThreshold,
  getDataRefreshIntervalDays,
  getLastMileThresholdKm,
  getMockAverageSpeedKmh,
  getMockRoadDistanceFactor,
} from "./config";

const ENV_KEYS = [
  "JOLCHU_CONFIRMATION_CONFIDENCE_THRESHOLD",
  "JOLCHU_LAST_MILE_THRESHOLD_KM",
  "JOLCHU_DATA_REFRESH_INTERVAL_DAYS",
  "JOLCHU_MOCK_ROAD_DISTANCE_FACTOR",
  "JOLCHU_MOCK_AVERAGE_SPEED_KMH",
];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("Jolchu config defaults", () => {
  it("falls back to safe defaults when nothing is configured", () => {
    expect(getConfirmationConfidenceThreshold()).toBe(0.6);
    expect(getLastMileThresholdKm()).toBe(5);
    expect(getDataRefreshIntervalDays()).toBe(30);
    expect(getMockRoadDistanceFactor()).toBe(1.3);
    expect(getMockAverageSpeedKmh()).toBe(55);
  });

  it("reads a valid override from the environment", () => {
    process.env.JOLCHU_LAST_MILE_THRESHOLD_KM = "12";
    expect(getLastMileThresholdKm()).toBe(12);
  });

  it("rejects an out-of-range confidence threshold and falls back to default", () => {
    process.env.JOLCHU_CONFIRMATION_CONFIDENCE_THRESHOLD = "1.5";
    expect(getConfirmationConfidenceThreshold()).toBe(0.6);
  });

  it("rejects a non-numeric override and falls back to default", () => {
    process.env.JOLCHU_DATA_REFRESH_INTERVAL_DAYS = "not-a-number";
    expect(getDataRefreshIntervalDays()).toBe(30);
  });

  it("rejects a zero or negative override", () => {
    process.env.JOLCHU_MOCK_AVERAGE_SPEED_KMH = "-5";
    expect(getMockAverageSpeedKmh()).toBe(55);
  });
});
