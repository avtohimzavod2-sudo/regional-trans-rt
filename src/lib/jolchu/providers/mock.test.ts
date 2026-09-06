import { describe, expect, it } from "vitest";
import { MockJolchuModelProvider } from "./mock";

const provider = new MockJolchuModelProvider();

describe("MockJolchuModelProvider.understand", () => {
  it("never returns coordinates, distance, or duration fields — only text/flags", async () => {
    const out = await provider.understand({ text: "Возле ЦУМа буду ждать", role: "ORIGIN" });
    expect(out).not.toHaveProperty("latitude");
    expect(out).not.toHaveProperty("longitude");
    expect(out).not.toHaveProperty("distanceKm");
    expect(out).not.toHaveProperty("durationMin");
  });

  it("flags landmark phrasing", async () => {
    const out = await provider.understand({ text: "Возле ЦУМа буду ждать", role: "ORIGIN" });
    expect(out.isLandmarkPhrasing).toBe(true);
  });

  it("flags settlement-only phrasing without digits", async () => {
    const out = await provider.understand({ text: "село Ак-Суу", role: "DESTINATION" });
    expect(out.isSettlementOnly).toBe(true);
  });

  it("flags a known ambiguous landmark as possibly ambiguous", async () => {
    const out = await provider.understand({ text: "Аламедин", role: "SINGLE" });
    expect(out.possiblyAmbiguous).toBe(true);
    expect(out.notes).toMatch(/ALAMEDIN_AMBIGUOUS/);
  });

  it("does not flag an unambiguous known landmark as ambiguous", async () => {
    const out = await provider.understand({ text: "ЦУМ", role: "SINGLE" });
    expect(out.possiblyAmbiguous).toBe(false);
  });

  it("strips a filler greeting prefix from the geocode query", async () => {
    const out = await provider.understand({ text: "Привет, село Ак-Суу", role: "DESTINATION" });
    expect(out.geocodeQuery.toLowerCase()).not.toContain("привет");
  });

  it("never throws on empty text", async () => {
    await expect(provider.understand({ text: "", role: "SINGLE" })).resolves.toBeDefined();
  });
});
