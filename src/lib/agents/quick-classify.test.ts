import { describe, expect, it } from "vitest";
import { quickClassifyMessage } from "./quick-classify";

describe("quickClassifyMessage", () => {
  it("detects a passenger request in Russian", () => {
    const r = quickClassifyMessage("Здравствуйте, нужно 2 места до Каракола на завтра");
    expect(r.role).toBe("passenger");
    expect(r.intent).toBe("trip_request");
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("detects a driver offer in Russian", () => {
    const r = quickClassifyMessage("Выезжаю в Каракол в 8:00, 3 места свободно");
    expect(r.role).toBe("driver");
    expect(r.intent).toBe("trip_offer");
  });

  it("detects a driver offer in literary Kyrgyz", () => {
    const r = quickClassifyMessage("Каракөлгө чыгам, бош орун бар");
    expect(r.role).toBe("driver");
    expect(r.intent).toBe("trip_offer");
  });

  it("detects a passenger request in informal Kyrgyz (no ө/ү/ң keys)", () => {
    // "орун керек" typed without the ө/ү/ң special letters, as commonly seen on phone keyboards
    const r = quickClassifyMessage("Бишкекден Каракол999га орун керек эртен учун");
    expect(r.role).toBe("passenger");
    expect(r.intent).toBe("trip_request");
  });

  it("handles mixed Kyrgyz-Russian text without picking a wrong side", () => {
    // one passenger signal (KY) + one driver signal (RU), tied 1-1 -> mixed, not silently guessed
    const r = quickClassifyMessage("орун керек, но еду с пассажирами тоже могу");
    expect(r.role).toBe("mixed");
    expect(r.intent).toBe("unrecognized");
  });

  it("detects a parcel request", () => {
    const r = quickClassifyMessage("Нужно отправить посылку в Каракол, заберите посылку из Бишкека");
    expect(r.role).toBe("parcel_sender");
    expect(r.intent).toBe("parcel");
  });

  it("detects a cancellation regardless of role wording", () => {
    const r = quickClassifyMessage("Извините, не поеду сегодня, отменяю заявку");
    expect(r.intent).toBe("cancellation");
  });

  it("returns unknown/unrecognized with zero confidence for unrelated chatter", () => {
    const r = quickClassifyMessage("Привет как дела, что нового?");
    expect(r.role).toBe("unknown");
    expect(r.intent).toBe("unrecognized");
    expect(r.confidence).toBe(0);
  });
});
