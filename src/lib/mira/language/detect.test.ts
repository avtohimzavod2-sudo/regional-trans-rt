import { describe, expect, it } from "vitest";
import { detectMiraLanguage } from "./detect";

describe("detectMiraLanguage", () => {
  it("detects literary Kyrgyz with special letters", () => {
    const r = detectMiraLanguage("Эртең Бишкектен Караколго саат жетиде кетем, үч орун бар");
    expect(r.language).toBe("KY");
    expect(r.scriptGuess).toBe("CYRILLIC");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("detects Kyrgyz typed without special letters (Russian keyboard)", () => {
    const r = detectMiraLanguage("Эртен Бишкектен Караколго кетем, 3 орун бар");
    expect(r.language).toBe("KY");
  });

  it("detects romanized Kyrgyz typed on a Latin keyboard", () => {
    const r = detectMiraLanguage("erte karakolgo ketem");
    expect(r.language).toBe("KY");
    expect(r.scriptGuess).toBe("LATIN");
  });

  it("detects plain Russian", () => {
    const r = detectMiraLanguage("Здравствуйте, мне нужно место завтра утром до Каракола");
    expect(r.language).toBe("RU");
  });

  it("detects plain English", () => {
    const r = detectMiraLanguage("Hello, I need a seat tomorrow morning to Karakol please");
    expect(r.language).toBe("EN");
  });

  it("flags Kyrgyz-Russian code-switching", () => {
    const r = detectMiraLanguage("Эртен утром Бишкектен Караколго 2 места керек");
    expect(r.codeSwitched).toBe(true);
    expect(r.secondaryLanguage).not.toBeNull();
  });

  it("returns zero confidence for empty text", () => {
    const r = detectMiraLanguage("");
    expect(r.confidence).toBe(0);
  });

  it("never throws on garbage input", () => {
    expect(() => detectMiraLanguage("!!! 123 ???")).not.toThrow();
  });
});
