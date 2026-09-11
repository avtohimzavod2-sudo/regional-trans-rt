import { beforeEach, describe, expect, it } from "vitest";
import { makeDriver, makeDriverOffer, makeMatch, makePassenger, makeTripRequest, resetFactoryCounter } from "./factories";

describe("test factories", () => {
  beforeEach(() => {
    resetFactoryCounter();
  });

  it("makeDriver applies sensible defaults and unique ids", () => {
    const a = makeDriver();
    const b = makeDriver();
    expect(a.telegramUserId).not.toBe(b.telegramUserId);
    expect(a.preferredLang).toBe("RU");
  });

  it("makeDriver honors overrides without dropping unset defaults", () => {
    const driver = makeDriver({ preferredLang: "KG", name: "Aibek" });
    expect(driver.preferredLang).toBe("KG");
    expect(driver.name).toBe("Aibek");
    expect(driver.phone).toBeNull();
  });

  it("makePassenger applies sensible defaults and unique ids", () => {
    const a = makePassenger();
    const b = makePassenger();
    expect(a.whatsappId).not.toBe(b.whatsappId);
  });

  it("makeTripRequest nests a generated passenger by default and links its id", () => {
    const req = makeTripRequest();
    expect(req.passenger).toBeDefined();
    expect(req.seats).toBe(1);
  });

  it("makeTripRequest accepts a caller-supplied passenger instead of generating one", () => {
    const passenger = makePassenger({ name: "Aigerim" });
    const req = makeTripRequest({ passenger, seats: 3 });
    expect(req.passenger).toBe(passenger);
    expect(req.seats).toBe(3);
  });

  it("makeDriverOffer nests a generated driver by default", () => {
    const offer = makeDriverOffer();
    expect(offer.driver).toBeDefined();
  });

  it("makeMatch wires tripRequestId to the nested tripRequest's id by default", () => {
    const match = makeMatch();
    expect(match.tripRequestId).toBe(match.tripRequest.id);
    expect(match.status).toBe("AWAITING_DRIVER");
  });

  it("makeMatch honors an explicit status and nested overrides together", () => {
    const driver = makeDriver({ telegramUserId: "tg-fixed" });
    const match = makeMatch({ status: "AWAITING_PASSENGER", driverOffer: makeDriverOffer({ driver }) });
    expect(match.status).toBe("AWAITING_PASSENGER");
    expect(match.driverOffer.driver.telegramUserId).toBe("tg-fixed");
  });

  it("resetFactoryCounter makes generated ids deterministic across test runs", () => {
    resetFactoryCounter();
    const first = makeDriver();
    resetFactoryCounter();
    const second = makeDriver();
    expect(first.telegramUserId).toBe(second.telegramUserId);
  });
});
