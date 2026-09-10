import { describe, expect, it } from "vitest";
import { classifyDriverTelemetryText } from "./telemetry-classify";

describe("classifyDriverTelemetryText", () => {
  it("returns null/0 confidence for unrelated text — never guesses", () => {
    const result = classifyDriverTelemetryText("Привет, как дела?");
    expect(result.signalType).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("classifies ON_DUTY", () => {
    expect(classifyDriverTelemetryText("Вышел на линию").signalType).toBe("ON_DUTY");
  });

  it("classifies WAITING_PASSENGERS", () => {
    expect(classifyDriverTelemetryText("Жду пассажиров на автовокзале").signalType).toBe("WAITING_PASSENGERS");
  });

  it("classifies DEPARTED", () => {
    expect(classifyDriverTelemetryText("Выехал, едем").signalType).toBe("DEPARTED");
  });

  it("classifies ARRIVED and does not confuse it with TRIP_COMPLETED", () => {
    expect(classifyDriverTelemetryText("Приехал на место").signalType).toBe("ARRIVED");
  });

  it("classifies TRIP_COMPLETED distinctly from ARRIVED", () => {
    expect(classifyDriverTelemetryText("Рейс завершен, всех высадил").signalType).toBe("TRIP_COMPLETED");
  });

  it("classifies SEATS_UPDATED and extracts the seat count", () => {
    const result = classifyDriverTelemetryText("Осталось 2 места свободно");
    expect(result.signalType).toBe("SEATS_UPDATED");
    expect(result.seatsAvailable).toBe(2);
  });

  it("classifies DELAYED and extracts delay minutes when present", () => {
    const result = classifyDriverTelemetryText("Задержка, опаздываю на 20 минут");
    expect(result.signalType).toBe("DELAYED");
    expect(result.delayMinutes).toBe(20);
  });

  it("classifies DELAYED without minutes when none stated", () => {
    const result = classifyDriverTelemetryText("Опаздываю немного");
    expect(result.signalType).toBe("DELAYED");
    expect(result.delayMinutes).toBeUndefined();
  });

  it("classifies BREAKDOWN_OPENED", () => {
    expect(classifyDriverTelemetryText("Машина сломалась на трассе").signalType).toBe("BREAKDOWN_OPENED");
  });

  it("classifies BREAKDOWN_RESOLVED distinctly from BREAKDOWN_OPENED (checked first, since it is a superstring)", () => {
    expect(classifyDriverTelemetryText("Поломка устранена, едем дальше").signalType).toBe("BREAKDOWN_RESOLVED");
  });

  it("classifies ETA_REQUEST", () => {
    const result = classifyDriverTelemetryText("Сколько ехать до Оша?");
    expect(result.signalType).toBe("ETA_REQUEST");
    expect(result.freeText).toBe("Сколько ехать до Оша?");
  });

  it("classifies LOCATION_UPDATE and carries the free text through untouched", () => {
    const result = classifyDriverTelemetryText("Я сейчас в Токмоке");
    expect(result.signalType).toBe("LOCATION_UPDATE");
    expect(result.freeText).toBe("Я сейчас в Токмоке");
  });

  it("never classifies a plain greeting as any operational signal", () => {
    const result = classifyDriverTelemetryText("Спасибо, хорошего дня");
    expect(result.signalType).toBeNull();
  });
});
