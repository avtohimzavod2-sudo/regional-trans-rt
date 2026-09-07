import { describe, expect, it } from "vitest";
import { canConfirmShipment, classifyConfirmationReply, pickNextOfferedQuote } from "./confirmation";

describe("canConfirmShipment", () => {
  it("is PENDING only while awaiting confirmation", () => {
    expect(canConfirmShipment("AWAITING_CONFIRMATION")).toBe("PENDING");
  });

  it("treats an already-confirmed-or-further shipment as a safe no-op, not an error", () => {
    expect(canConfirmShipment("CONFIRMED")).toBe("ALREADY_DONE");
    expect(canConfirmShipment("AWAITING_PICKUP")).toBe("ALREADY_DONE");
    expect(canConfirmShipment("PICKED_UP")).toBe("ALREADY_DONE");
    expect(canConfirmShipment("IN_TRANSIT")).toBe("ALREADY_DONE");
    expect(canConfirmShipment("DELIVERED")).toBe("ALREADY_DONE");
    expect(canConfirmShipment("DISPUTED")).toBe("ALREADY_DONE");
  });

  it("rejects confirming a shipment that was never offered a quote to confirm", () => {
    expect(canConfirmShipment("DRAFT")).toBe("INVALID");
    expect(canConfirmShipment("NEEDS_INFO")).toBe("INVALID");
    expect(canConfirmShipment("SEARCHING")).toBe("INVALID");
    expect(canConfirmShipment("QUOTED")).toBe("INVALID");
    expect(canConfirmShipment("FAILED")).toBe("INVALID");
    expect(canConfirmShipment("CANCELLED")).toBe("INVALID");
  });
});

describe("pickNextOfferedQuote", () => {
  it("picks the highest-scoring remaining offered/recommended quote, excluding the rejected one", () => {
    const quotes = [
      { id: "a", status: "REJECTED" as const, rankScore: 90 },
      { id: "b", status: "OFFERED" as const, rankScore: 70 },
      { id: "c", status: "RECOMMENDED" as const, rankScore: 55 },
    ];
    expect(pickNextOfferedQuote(quotes, "a")?.id).toBe("b");
  });

  it("returns null when nothing open remains", () => {
    const quotes = [
      { id: "a", status: "REJECTED" as const, rankScore: 90 },
      { id: "b", status: "EXPIRED" as const, rankScore: 70 },
    ];
    expect(pickNextOfferedQuote(quotes, "a")).toBeNull();
  });

  it("never re-offers the quote that was just excluded even if still marked offered", () => {
    const quotes = [{ id: "a", status: "OFFERED" as const, rankScore: 90 }];
    expect(pickNextOfferedQuote(quotes, "a")).toBeNull();
  });
});

describe("classifyConfirmationReply", () => {
  it("recognizes plain confirmations across RU/KY/EN", () => {
    expect(classifyConfirmationReply("да")).toBe("CONFIRM");
    expect(classifyConfirmationReply("Да, подтверждаю")).toBe("CONFIRM");
    expect(classifyConfirmationReply("хорошо")).toBe("CONFIRM");
    expect(classifyConfirmationReply("ok")).toBe("CONFIRM");
    expect(classifyConfirmationReply("yes please")).toBe("CONFIRM");
    expect(classifyConfirmationReply("макул")).toBe("CONFIRM");
    expect(classifyConfirmationReply("болот")).toBe("CONFIRM");
  });

  it("recognizes plain rejections across RU/KY/EN", () => {
    expect(classifyConfirmationReply("нет")).toBe("REJECT");
    expect(classifyConfirmationReply("другой вариант, пожалуйста")).toBe("REJECT");
    expect(classifyConfirmationReply("отмена")).toBe("REJECT");
    expect(classifyConfirmationReply("cancel")).toBe("REJECT");
    expect(classifyConfirmationReply("жок")).toBe("REJECT");
  });

  it("classifies a negated confirmation word as a rejection, not a confirmation", () => {
    // "не подтверждаю" contains the substring "подтвержда" — must not be
    // misread as CONFIRM just because that substring is present.
    expect(classifyConfirmationReply("не подтверждаю")).toBe("REJECT");
    expect(classifyConfirmationReply("не согласна на этот вариант")).toBe("REJECT");
  });

  it("returns UNCLEAR for text that isn't a recognizable yes/no reply", () => {
    expect(classifyConfirmationReply("а сколько это будет стоить с доставкой в другой район города")).toBe("UNCLEAR");
    expect(classifyConfirmationReply("")).toBe("UNCLEAR");
  });
});
