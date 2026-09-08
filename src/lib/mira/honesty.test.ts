import { describe, expect, it } from "vitest";
import { detectUnverifiedClaims, type VerifiableFact } from "./honesty";
import { composeFallbackReply, situationForOutcome } from "./reply-templates";

const ALL_OUTCOMES: Parameters<typeof composeFallbackReply>[0][] = [
  "trip_request_created",
  "driver_offer_created",
  "cancellation_case_opened",
  "group_message_recorded",
  "unrecognized",
  "group_message_skipped",
];

describe("detectUnverifiedClaims — proving Mira does not invent facts", () => {
  const cases: { fact: VerifiableFact; text: string }[] = [
    { fact: "price", text: "Сапарыңыздын баасы 500 сом болот." },
    { fact: "availableDrivers", text: "Хорошая новость: водитель найден для вашей поездки." },
    { fact: "availableSeats", text: "3 орун бар, азыр эле жазылыңыз." },
    { fact: "bookingConfirmation", text: "Ваша бронь подтверждена, ждите водителя." },
    { fact: "departureTime", text: "Отправление в 07:30 от автовокзала." },
    { fact: "arrivalTime", text: "Машина arrives at 14:00 in Osh." },
    { fact: "paymentStatus", text: "Оплата получена, спасибо!" },
    { fact: "parcelAcceptance", text: "Ваша посылка принята к отправке." },
    { fact: "phoneNumber", text: "Водителдин номери: +996700123456." },
    { fact: "vehicleData", text: "Сизди Toyota Camry, номери 01KG123ABC күтөт." },
    { fact: "rtPointAvailability", text: "RT Point свободен, можете подъезжать." },
  ];

  for (const { fact, text } of cases) {
    it(`flags an unverified "${fact}" claim`, () => {
      const result = detectUnverifiedClaims(text);
      expect(result.safe).toBe(false);
      expect(result.violations).toContain(fact);
    });

    it(`does not flag "${fact}" when it is listed as a known/verified fact`, () => {
      const result = detectUnverifiedClaims(text, new Set([fact]));
      expect(result.violations).not.toContain(fact);
    });
  }

  it("passes clean text with no factual claims at all", () => {
    const result = detectUnverifiedClaims("Кабыл алдым, сапарды издеп жатам. Ылайыктуу айдоочу табылганда дароо жазам.");
    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("passes an ordinary clarification question mentioning seats without claiming a count", () => {
    const result = detectUnverifiedClaims("Сураныч, кайдан, кайда, качан жана канча орун керек экенин жазыңыз.");
    expect(result.safe).toBe(true);
  });

  it("collects multiple violations when a reply stacks several unverified claims", () => {
    const result = detectUnverifiedClaims("Водитель найден, цена 500 сом, оплата получена.");
    expect(result.violations).toContain("availableDrivers");
    expect(result.violations).toContain("price");
    expect(result.violations).toContain("paymentStatus");
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });
});

describe("detectUnverifiedClaims — the real fallback templates never trip the guard", () => {
  for (const outcome of ALL_OUTCOMES) {
    for (const language of ["KY", "RU", "EN"] as const) {
      it(`composeFallbackReply(${outcome}, ${language}) is honesty-clean`, () => {
        const text = composeFallbackReply(outcome, language);
        expect(detectUnverifiedClaims(text).safe).toBe(true);
      });
    }
  }

  for (const outcome of ALL_OUTCOMES) {
    it(`situationForOutcome(${outcome}) is honesty-clean`, () => {
      expect(detectUnverifiedClaims(situationForOutcome(outcome)).safe).toBe(true);
    });
  }
});
