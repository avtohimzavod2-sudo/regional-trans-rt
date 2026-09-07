import { describe, expect, it } from "vitest";
import { pickJolchuLocationInputs } from "./jolchu-bridge";
import type { MiraNormalizedFields } from "./types";

describe("pickJolchuLocationInputs", () => {
  it("uses raw text as a single origin when Mira extracted no from/to", () => {
    const entities: MiraNormalizedFields = {};
    const result = pickJolchuLocationInputs("возле старого автовокзала", entities);
    expect(result).toEqual({ origin: "возле старого автовокзала" });
  });

  it("uses the extracted from field as origin, with no destination, when only from is known", () => {
    const entities: MiraNormalizedFields = { from: "ЦУМ, Бишкек" };
    const result = pickJolchuLocationInputs("рядом с ЦУМ, сколько км до Оша", entities);
    expect(result).toEqual({ origin: "ЦУМ, Бишкек" });
  });

  it("uses both extracted from/to as origin and destination when both are known", () => {
    const entities: MiraNormalizedFields = { from: "ЦУМ, Бишкек", to: "автовокзал, Ош" };
    const result = pickJolchuLocationInputs("маршрут от ЦУМ до автовокзала Ош", entities);
    expect(result).toEqual({ origin: "ЦУМ, Бишкек", destination: "автовокзал, Ош" });
  });

  it("falls back to raw text when from is blank/whitespace-only", () => {
    const entities: MiraNormalizedFields = { from: "   ", to: "Ош" };
    const result = pickJolchuLocationInputs("маршрут текст", entities);
    expect(result).toEqual({ origin: "маршрут текст" });
  });

  it("never fabricates a destination when only from is present", () => {
    const entities: MiraNormalizedFields = { from: "ориентир возле рынка" };
    const result = pickJolchuLocationInputs("текст", entities);
    expect(result.destination).toBeUndefined();
  });
});
