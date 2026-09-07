import { describe, expect, it } from "vitest";
import { extractShipmentFields } from "./extract";

describe("extractShipmentFields — RT Kyrgyz Benchmark fixtures", () => {
  it("extracts a Russian preposition route, weight, and pickup time", () => {
    const r = extractShipmentFields("Из Бишкека в Ош, коробка 5 кг, нужно забрать завтра");
    expect(r.pickupText).toBe("Бишкека");
    expect(r.destinationText).toBe("Ош");
    expect(r.cargoDescription).toBe("коробка");
    expect(r.weightKg).toBe(5);
    expect(r.preferredPickupTime).toBe("завтра");
  });

  it("extracts a reverse-direction preposition route without a weight", () => {
    const r = extractShipmentFields("С Оша в Бишкек запчасть, маленькая, срочно");
    expect(r.pickupText).toBe("Оша");
    expect(r.destinationText).toBe("Бишкек");
    expect(r.cargoDescription).toBe("запчасть");
    expect(r.weightKg).toBeNull();
  });

  it("extracts a Kyrgyz case-suffix route including a hyphenated place name and weight", () => {
    const r = extractShipmentFields("Бишкектен Чолпон-Атага посылка жиберем, 2 кг");
    expect(r.pickupText).toBe("Бишкектен");
    expect(r.destinationText).toBe("Чолпон-Атага");
    expect(r.cargoDescription).toBe("посылка");
    expect(r.weightKg).toBe(2);
  });

  it("extracts a fragile-cargo route via prepositions", () => {
    const r = extractShipmentFields("Заберите хрупкий телевизор из Токмок в Каракол");
    expect(r.pickupText).toBe("Токмок");
    expect(r.destinationText).toBe("Каракол");
    expect(r.cargoDescription).toBe("телевизор");
    expect(r.fragile).toBe(true);
  });

  it("extracts piece count and flags lithium-battery cargo nouns", () => {
    const r = extractShipmentFields("Отправьте powerbank и аккумуляторы из Бишкека в Ош, 1 коробка");
    expect(r.pickupText).toBe("Бишкека");
    expect(r.destinationText).toBe("Ош");
    expect(r.cargoDescription).toBe("коробка");
    expect(r.pieces).toBe(1);
  });

  it("never invents a place when the text has none", () => {
    const r = extractShipmentFields("Нужно отправить груз, но пока не знаю точный адрес получателя");
    expect(r.pickupText).toBeNull();
    expect(r.destinationText).toBeNull();
    expect(r.cargoDescription).toBe("груз");
  });

  it("extracts weight in kg written with a Cyrillic unit (regression: JS \\b never fires around Cyrillic)", () => {
    expect(extractShipmentFields("коробка 5 кг, нужно забрать завтра").weightKg).toBe(5);
    expect(extractShipmentFields("посылка 2 кг").weightKg).toBe(2);
  });

  it("never throws on empty input", () => {
    expect(() => extractShipmentFields("")).not.toThrow();
    const r = extractShipmentFields("");
    expect(r.pickupText).toBeNull();
    expect(r.cargoDescription).toBeNull();
  });
});
