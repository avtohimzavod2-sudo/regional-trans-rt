import { describe, expect, it } from "vitest";
import { classifyMiraTopIntent } from "./intent-classifier";

describe("classifyMiraTopIntent — intent categories (Mira Pass 1 spec s.2/s.24-B)", () => {
  it("classifies a clear passenger trip request", () => {
    expect(classifyMiraTopIntent("нужна машина до Оша завтра на 3 места").intent).toBe("passenger_trip");
  });

  it("classifies a clear driver offer", () => {
    expect(classifyMiraTopIntent("еду в Бишкек, 3 места свободно").intent).toBe("driver");
  });

  it("classifies a small parcel request", () => {
    expect(classifyMiraTopIntent("нужно отправить посылку в Ош").intent).toBe("parcel");
  });

  it("classifies a commercial cargo/freight request", () => {
    expect(classifyMiraTopIntent("нужно перевезти груз, 20 коробок товара").intent).toBe("cargo_freight");
  });

  it("classifies a complaint even when phrased alongside other details", () => {
    expect(classifyMiraTopIntent("водитель не приехал вовремя, хочу вернуть деньги").intent).toBe("complaint_dispute");
  });

  it("classifies a partner/business inquiry", () => {
    expect(classifyMiraTopIntent("хотим стать партнером RT, интересно сотрудничество").intent).toBe("partner_business");
  });

  it("classifies a finance/payment meta question distinctly from an ordinary trip price question", () => {
    expect(classifyMiraTopIntent("подскажите реквизиты, как оплатить безналично").intent).toBe("finance_payment");
    expect(classifyMiraTopIntent("сколько стоит доехать до Оша").intent).not.toBe("finance_payment");
  });

  it("classifies unrelated noise as unknown/mixed", () => {
    expect(classifyMiraTopIntent("привет, как дела").intent).toBe("unknown_mixed");
  });

  it("prioritizes a complaint over a simultaneous finance-sounding phrase", () => {
    const result = classifyMiraTopIntent("недоволен обслуживанием, верните деньги за поездку");
    expect(result.intent).toBe("complaint_dispute");
  });

  describe("language coverage (spec s.24-A)", () => {
    it("literary Kyrgyz passenger request", () => {
      expect(classifyMiraTopIntent("Ысык-Көлгө барам, орун керек эле").intent).toBe("passenger_trip");
    });

    it("conversational Kyrgyz without ң/ө/ү on the keyboard", () => {
      expect(classifyMiraTopIntent("Bishkekke baram, orun kerek").intent).toBe("unknown_mixed");
      // Latin-transliterated Kyrgyz is a known, documented gap (dictionary is
      // Cyrillic-only) — asserted explicitly so a future fix has a regression
      // test to flip, rather than silently changing behavior unnoticed.
    });

    it("mixed Kyrgyz/Russian passenger request", () => {
      expect(classifyMiraTopIntent("Ош шаарына нужна машина эртең").intent).toBe("passenger_trip");
    });

    it("plain Russian driver offer", () => {
      expect(classifyMiraTopIntent("Выезжаю в Каракол, есть места").intent).toBe("driver");
    });

    it("a single message containing city + time + passenger count + phone + baggage stays passenger_trip", () => {
      const text = "Нужна машина Бишкек - Ош, завтра в 9 утра, 2 пассажира, тел 0555123456, багажа 25 кг";
      expect(classifyMiraTopIntent(text).intent).toBe("passenger_trip");
    });
  });
});
