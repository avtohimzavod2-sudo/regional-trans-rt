import { describe, expect, it } from "vitest";
import { looksFullySanitized, sanitizeForTraining } from "./sanitize";

describe("sanitizeForTraining", () => {
  it("redacts a phone number", () => {
    const result = sanitizeForTraining("Позвоните мне на 0555123456 завтра");
    expect(result.sanitized).not.toContain("0555123456");
    expect(result.sanitized).toContain("[PHONE]");
    expect(result.redactedCategories).toContain("PHONE");
    expect(result.redactionCount).toBeGreaterThan(0);
  });

  it("redacts an email address", () => {
    const result = sanitizeForTraining("Пишите на driver.bakyt@example.com пожалуйста");
    expect(result.sanitized).not.toContain("driver.bakyt@example.com");
    expect(result.redactedCategories).toContain("EMAIL");
  });

  it("redacts a Telegram-style handle", () => {
    const result = sanitizeForTraining("Напишите мне @bakyt_driver в телеграм");
    expect(result.sanitized).not.toContain("@bakyt_driver");
    expect(result.redactedCategories).toContain("TELEGRAM_HANDLE");
  });

  it("leaves ordinary route text untouched", () => {
    const result = sanitizeForTraining("Эртен Бишкектен Караколго кетем");
    expect(result.sanitized).toBe("Эртен Бишкектен Караколго кетем");
    expect(result.redactionCount).toBe(0);
  });
});

describe("looksFullySanitized", () => {
  it("is stable across repeated calls on the same unsanitized input", () => {
    const text = "Мой номер 0555123456";
    expect(looksFullySanitized(text)).toBe(false);
    expect(looksFullySanitized(text)).toBe(false);
    expect(looksFullySanitized(text)).toBe(false);
  });

  it("is stable across repeated calls on already-sanitized input", () => {
    const text = sanitizeForTraining("Мой номер 0555123456").sanitized;
    expect(looksFullySanitized(text)).toBe(true);
    expect(looksFullySanitized(text)).toBe(true);
  });
});
