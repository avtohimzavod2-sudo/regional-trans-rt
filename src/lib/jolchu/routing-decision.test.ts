import { describe, expect, it } from "vitest";
import { decideJolchuRouting } from "./routing-decision";

describe("decideJolchuRouting — negatives (Jolchu must never activate)", () => {
  it("does not activate on a greeting", () => {
    expect(decideJolchuRouting("Салам, как дела?").required).toBe(false);
  });

  it("does not activate on a price question", () => {
    const r = decideJolchuRouting("Сколько стоит билет до Оша?");
    expect(r.required).toBe(false);
    expect(r.reasonCode).toBeNull();
  });

  it("does not activate on a plain corridor trip request between known cities", () => {
    expect(decideJolchuRouting("Бишкектен Ошко 2 орун керек").required).toBe(false);
  });

  it("does not activate on a farewell", () => {
    expect(decideJolchuRouting("Спасибо, до свидания").required).toBe(false);
  });

  it("does not activate on an unrelated FAQ question", () => {
    expect(decideJolchuRouting("Как оплатить картой?").required).toBe(false);
  });
});

describe("decideJolchuRouting — positives", () => {
  it("activates on raw coordinates with LOCATION_RESOLUTION", () => {
    const r = decideJolchuRouting("Заберите меня с 42.8746, 74.5698");
    expect(r.required).toBe(true);
    expect(r.reasonCode).toBe("LOCATION_RESOLUTION");
  });

  it("activates on a Google Maps link with LOCATION_RESOLUTION", () => {
    const r = decideJolchuRouting("вот точка https://maps.google.com/@42.87,74.59,17z");
    expect(r.required).toBe(true);
    expect(r.reasonCode).toBe("LOCATION_RESOLUTION");
  });

  it("activates on a 2GIS link with LOCATION_RESOLUTION", () => {
    const r = decideJolchuRouting("вот точка https://2gis.kg/bishkek/geo/74.5,42.8");
    expect(r.required).toBe(true);
    expect(r.reasonCode).toBe("LOCATION_RESOLUTION");
  });

  it("activates on a traffic question with TRAFFIC_CHECK", () => {
    expect(decideJolchuRouting("Там сейчас большие пробки?").reasonCode).toBe("TRAFFIC_CHECK");
  });

  it("activates on an ETA question with TRAFFIC_CHECK", () => {
    expect(decideJolchuRouting("Во сколько приедем?").reasonCode).toBe("TRAFFIC_CHECK");
  });

  it("activates on a Last Mile phrase with LAST_MILE", () => {
    const r = decideJolchuRouting("После Каракола еще 10 км до села");
    expect(r.required).toBe(true);
    expect(r.reasonCode).toBe("LAST_MILE");
  });

  it("activates on an ambiguity-clarification phrase with AMBIGUITY_CHECK", () => {
    expect(decideJolchuRouting("Уточните адрес, где именно вас забрать?").reasonCode).toBe("AMBIGUITY_CHECK");
  });

  it("activates on a landmark phrase with LOCATION_RESOLUTION", () => {
    expect(decideJolchuRouting("Возле ЦУМа буду ждать").reasonCode).toBe("LOCATION_RESOLUTION");
  });

  it("activates on a settlement-only phrase with LOCATION_RESOLUTION", () => {
    expect(decideJolchuRouting("Мне нужно в село Ак-Суу").reasonCode).toBe("LOCATION_RESOLUTION");
  });

  it("activates on a route-building question with ROUTE_CALCULATION", () => {
    const r = decideJolchuRouting("Бишкектен Ошко чейинки маршрут канча км болот?");
    expect(r.required).toBe(true);
    expect(r.reasonCode).toBe("ROUTE_CALCULATION");
  });

  it("always returns the literal matched signal for audit purposes", () => {
    const r = decideJolchuRouting("Там пробки на трассе");
    expect(r.matchedSignal).not.toBeNull();
  });

  it("never throws on empty input", () => {
    expect(() => decideJolchuRouting("")).not.toThrow();
    expect(decideJolchuRouting("").required).toBe(false);
  });
});
