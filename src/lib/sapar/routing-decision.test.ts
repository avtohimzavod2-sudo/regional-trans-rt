import { describe, expect, it } from "vitest";
import { decideSaparRouting } from "./routing-decision";

describe("decideSaparRouting — positives", () => {
  it("activates on an unambiguous cargo noun", () => {
    const r = decideSaparRouting("Хочу отправить посылку в Ош");
    expect(r.required).toBe(true);
    expect(r.matchedSignal).toBe("посылк");
  });

  it("activates on a box/cargo noun", () => {
    expect(decideSaparRouting("Из Бишкека в Ош, коробка 5 кг").required).toBe(true);
  });

  it("activates on a delivery verb when not about a person", () => {
    const r = decideSaparRouting("Нужно отправить документы в Ош");
    expect(r.required).toBe(true);
    expect(r.matchedSignal).toBe("отправ");
  });

  it("activates on a pickup+dropoff verb combo", () => {
    const r = decideSaparRouting("Заберите из офиса и отвезти на склад");
    expect(r.required).toBe(true);
    expect(r.matchedSignal).toBe("pickup_and_dropoff_combo");
  });
});

describe("decideSaparRouting — negatives (must not hijack passenger trips)", () => {
  it("does not activate on a passenger delivery-verb phrase about a person", () => {
    expect(decideSaparRouting("Довезите меня до вокзала").required).toBe(false);
  });

  it("does not activate on a greeting", () => {
    expect(decideSaparRouting("Салам, как дела?").required).toBe(false);
  });

  it("does not activate on an unrelated price question", () => {
    expect(decideSaparRouting("Сколько стоит билет до Оша?").required).toBe(false);
  });

  it("does not activate on a plain passenger corridor trip request", () => {
    expect(decideSaparRouting("Бишкектен Ошко 2 орун керек").required).toBe(false);
  });
});

describe("decideSaparRouting — general", () => {
  it("always returns the literal matched signal for audit purposes on a positive match", () => {
    const r = decideSaparRouting("груз на Ош");
    expect(r.matchedSignal).not.toBeNull();
  });

  it("never throws on empty input", () => {
    expect(() => decideSaparRouting("")).not.toThrow();
    expect(decideSaparRouting("").required).toBe(false);
  });
});
