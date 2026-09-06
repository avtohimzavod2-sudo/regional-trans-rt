import { describe, expect, it } from "vitest";
import {
  approximateLatinKyrgyzToCyrillic,
  foldKyrgyzSpecialLetters,
  hasCyrillicScript,
  hasKyrgyzSpecialLetters,
  hasLatinScript,
  normalizeForMatching,
} from "./normalize";

describe("foldKyrgyzSpecialLetters", () => {
  it("folds ө/ү/ң to nearest Cyrillic-ASCII letters", () => {
    expect(foldKyrgyzSpecialLetters("бүгүн эртең өзүм")).toBe("бугун эртен озум");
  });

  it("folds uppercase variants", () => {
    expect(foldKyrgyzSpecialLetters("ӨЗҮМ")).toBe("ОЗУМ");
  });

  it("leaves text without special letters untouched", () => {
    expect(foldKyrgyzSpecialLetters("бишкек каракол")).toBe("бишкек каракол");
  });
});

describe("normalizeForMatching", () => {
  it("lowercases, folds, strips punctuation, collapses whitespace", () => {
    expect(normalizeForMatching("Эртең,  Бишкектен  Караколго!")).toBe("эртен бишкектен караколго");
  });
});

describe("hasCyrillicScript / hasLatinScript / hasKyrgyzSpecialLetters", () => {
  it("detects Cyrillic script", () => {
    expect(hasCyrillicScript("Бишкек")).toBe(true);
    expect(hasCyrillicScript("Bishkek")).toBe(false);
  });

  it("detects Latin script", () => {
    expect(hasLatinScript("Bishkek")).toBe(true);
    expect(hasLatinScript("Бишкек")).toBe(false);
  });

  it("detects Kyrgyz special letters", () => {
    expect(hasKyrgyzSpecialLetters("бүгүн")).toBe(true);
    expect(hasKyrgyzSpecialLetters("бугун")).toBe(false);
  });
});

describe("approximateLatinKyrgyzToCyrillic", () => {
  it("transliterates a common romanized Kyrgyz phrase", () => {
    expect(approximateLatinKyrgyzToCyrillic("erte karakolgo ketem")).toBe("ерте караколго кетем");
  });
});
