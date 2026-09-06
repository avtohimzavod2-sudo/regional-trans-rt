import { describe, expect, it } from "vitest";
import { haversineDistanceKm, isValidLatitude, isValidLongitude } from "./geo";

describe("haversineDistanceKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceKm({ latitude: 42.87, longitude: 74.59 }, { latitude: 42.87, longitude: 74.59 })).toBe(0);
  });

  it("computes a plausible distance between Bishkek and Karakol", () => {
    const d = haversineDistanceKm({ latitude: 42.8746, longitude: 74.5698 }, { latitude: 42.4907, longitude: 78.3931 });
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(320);
  });

  it("is symmetric", () => {
    const a = { latitude: 42.8746, longitude: 74.5698 };
    const b = { latitude: 40.5283, longitude: 72.7985 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 9);
  });
});

describe("isValidLatitude", () => {
  it("accepts values in range", () => {
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
  });

  it("rejects out-of-range or non-finite values", () => {
    expect(isValidLatitude(90.1)).toBe(false);
    expect(isValidLatitude(-90.1)).toBe(false);
    expect(isValidLatitude(NaN)).toBe(false);
    expect(isValidLatitude(Infinity)).toBe(false);
  });
});

describe("isValidLongitude", () => {
  it("accepts values in range", () => {
    expect(isValidLongitude(0)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
  });

  it("rejects out-of-range or non-finite values", () => {
    expect(isValidLongitude(180.1)).toBe(false);
    expect(isValidLongitude(-180.1)).toBe(false);
    expect(isValidLongitude(NaN)).toBe(false);
  });
});
