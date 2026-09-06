import { describe, expect, it } from "vitest";
import { parseLocationInput, parseLocationPayload, parseLocationText } from "./parse-input";

describe("parseLocationText", () => {
  it("parses raw coordinates", () => {
    const r = parseLocationText("42.8746, 74.5698");
    expect(r.inputType).toBe("COORDINATES");
    expect(r.latitude).toBe(42.8746);
    expect(r.longitude).toBe(74.5698);
    expect(r.invalidCoordinates).toBe(false);
  });

  it("flags out-of-range coordinate-shaped input as invalid, never silently clamping", () => {
    const r = parseLocationText("142.8746, 74.5698");
    expect(r.inputType).toBe("COORDINATES");
    expect(r.latitude).toBeNull();
    expect(r.longitude).toBeNull();
    expect(r.invalidCoordinates).toBe(true);
  });

  it("extracts coordinates from a Google Maps @lat,lon URL", () => {
    const r = parseLocationText("https://maps.google.com/@42.87,74.59,17z");
    expect(r.inputType).toBe("GOOGLE_MAPS_LINK");
    expect(r.latitude).toBe(42.87);
    expect(r.longitude).toBe(74.59);
  });

  it("extracts coordinates from a Google Maps ?q=lat,lon URL", () => {
    const r = parseLocationText("https://maps.google.com/maps?q=42.87,74.59");
    expect(r.inputType).toBe("GOOGLE_MAPS_LINK");
    expect(r.latitude).toBe(42.87);
    expect(r.longitude).toBe(74.59);
  });

  it("keeps a Google Maps short link as text when no coordinates are embedded", () => {
    const r = parseLocationText("https://goo.gl/maps/abcd1234");
    expect(r.inputType).toBe("GOOGLE_MAPS_LINK");
    expect(r.latitude).toBeNull();
    expect(r.text).toBe("https://goo.gl/maps/abcd1234");
  });

  it("extracts lon,lat (reordered) from a 2GIS /geo/ path into lat,lon fields", () => {
    const r = parseLocationText("https://2gis.kg/bishkek/geo/74.5698,42.8746");
    expect(r.inputType).toBe("TWO_GIS_LINK");
    expect(r.latitude).toBe(42.8746);
    expect(r.longitude).toBe(74.5698);
  });

  it("classifies a landmark phrase", () => {
    const r = parseLocationText("Возле ЦУМа, напротив входа");
    expect(r.inputType).toBe("LANDMARK");
    expect(r.text).toBe("Возле ЦУМа, напротив входа");
  });

  it("classifies a settlement-only phrase without a street", () => {
    const r = parseLocationText("село Ак-Суу");
    expect(r.inputType).toBe("SETTLEMENT_ONLY");
  });

  it("does not classify a settlement phrase with digits as SETTLEMENT_ONLY", () => {
    const r = parseLocationText("село Ак-Суу, дом 12");
    expect(r.inputType).not.toBe("SETTLEMENT_ONLY");
  });

  it("falls back to TEXT_ADDRESS for a plain address", () => {
    const r = parseLocationText("Бишкек, ул. Чуй 123");
    expect(r.inputType).toBe("TEXT_ADDRESS");
  });

  it("returns UNKNOWN for empty input", () => {
    const r = parseLocationText("   ");
    expect(r.inputType).toBe("UNKNOWN");
  });
});

describe("parseLocationPayload", () => {
  it("parses a valid live-location payload", () => {
    const r = parseLocationPayload({ latitude: 42.8746, longitude: 74.5698, isLivePayload: true });
    expect(r.inputType).toBe("LIVE_LOCATION");
    expect(r.latitude).toBe(42.8746);
    expect(r.invalidCoordinates).toBe(false);
  });

  it("flags an out-of-range live-location payload as invalid instead of passing it through", () => {
    const r = parseLocationPayload({ latitude: 999, longitude: 74.5698 });
    expect(r.invalidCoordinates).toBe(true);
    expect(r.latitude).toBeNull();
  });
});

describe("parseLocationInput", () => {
  it("dispatches string input to parseLocationText", () => {
    expect(parseLocationInput("село Ак-Суу").inputType).toBe("SETTLEMENT_ONLY");
  });

  it("dispatches object input to parseLocationPayload", () => {
    expect(parseLocationInput({ latitude: 42.87, longitude: 74.59 }).inputType).toBe("LIVE_LOCATION");
  });
});
