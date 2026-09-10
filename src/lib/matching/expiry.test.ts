import { beforeEach, describe, expect, it, vi } from "vitest";

// Coverage for the Match timeout sweep (README "Что дальше": Match.expiresAt
// was reserved in the schema but nothing ever expired it). Mirrors
// orchestrate.test.ts's mocking style — db, audit, and Mira's outbound
// boundary are all fully mocked, and proposeMatchesForRequest (re-matching)
// is mocked separately since it is exercised by orchestrate.test.ts already.

const { dbMocks, logActionMock, notifyDriverPrivatelyMock, notifyPassengerTextMock, proposeMatchesForRequestMock } = vi.hoisted(() => ({
  dbMocks: {
    match: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
    },
    tripRequest: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
    },
  },
  logActionMock: vi.fn().mockResolvedValue(undefined),
  notifyDriverPrivatelyMock: vi.fn().mockResolvedValue(undefined),
  notifyPassengerTextMock: vi.fn().mockResolvedValue(undefined),
  proposeMatchesForRequestMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("@/lib/audit", () => ({ logAction: logActionMock }));
vi.mock("@/lib/mira/outbound", () => ({
  notifyDriverPrivately: notifyDriverPrivatelyMock,
  notifyPassengerText: notifyPassengerTextMock,
}));
vi.mock("./orchestrate", () => ({ proposeMatchesForRequest: proposeMatchesForRequestMock }));

import { messages } from "@/lib/i18n/messages";
import { expireStaleMatches } from "./expiry";

const driverAwaitingMatch = {
  id: "match-driver-1",
  tripRequestId: "req-1",
  driverOfferId: "offer-1",
  driverOffer: { driver: { telegramUserId: "tg-driver-1", preferredLang: "RU" } },
};

const passengerAwaitingMatch = {
  id: "match-passenger-1",
  tripRequestId: "req-2",
  driverOfferId: "offer-2",
  driverOffer: { driver: { telegramUserId: "tg-driver-2", preferredLang: "RU" } },
  tripRequest: { passenger: { whatsappId: "wa-pax-2", preferredLang: "RU" } },
};

describe("expireStaleMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.match.findMany.mockResolvedValue([]);
    dbMocks.match.updateMany.mockResolvedValue({ count: 1 });
    proposeMatchesForRequestMock.mockResolvedValue({ id: "next-match" });
  });

  it("does nothing when no matches are due", async () => {
    const result = await expireStaleMatches();
    expect(result).toEqual({ driverTimeouts: 0, passengerTimeouts: 0 });
    expect(dbMocks.match.updateMany).not.toHaveBeenCalled();
  });

  it("expires an unanswered driver proposal, notifies the driver honestly, and retries the request", async () => {
    dbMocks.match.findMany.mockImplementation((args: { where: { status: string } }) =>
      args.where.status === "AWAITING_DRIVER" ? [driverAwaitingMatch] : [],
    );

    const result = await expireStaleMatches();

    expect(dbMocks.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-driver-1", status: "AWAITING_DRIVER" },
      data: { status: "EXPIRED" },
    });
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "match.expired_awaiting_driver", entityId: "match-driver-1" }));
    expect(notifyDriverPrivatelyMock).toHaveBeenCalledWith("tg-driver-1", messages.driverResponseTimedOut.RU);
    expect(proposeMatchesForRequestMock).toHaveBeenCalledWith("req-1");
    expect(result.driverTimeouts).toBe(1);
  });

  it("skips a driver match that already got a real response before the sweep ran (race guard)", async () => {
    dbMocks.match.findMany.mockImplementation((args: { where: { status: string } }) =>
      args.where.status === "AWAITING_DRIVER" ? [driverAwaitingMatch] : [],
    );
    dbMocks.match.updateMany.mockResolvedValue({ count: 0 });

    await expireStaleMatches();

    expect(logActionMock).not.toHaveBeenCalled();
    expect(notifyDriverPrivatelyMock).not.toHaveBeenCalled();
    expect(proposeMatchesForRequestMock).not.toHaveBeenCalled();
  });

  it("notifies the passenger honestly when no driver candidates remain after a driver timeout", async () => {
    dbMocks.match.findMany.mockImplementation((args: { where: { status: string } }) =>
      args.where.status === "AWAITING_DRIVER" ? [driverAwaitingMatch] : [],
    );
    proposeMatchesForRequestMock.mockResolvedValue(null);
    dbMocks.tripRequest.findUnique.mockResolvedValue({ passenger: { whatsappId: "wa-pax-1", preferredLang: "RU" } });

    await expireStaleMatches();

    expect(notifyPassengerTextMock).toHaveBeenCalledWith("wa-pax-1", messages.noCandidatesYet.RU);
  });

  it("expires an unanswered passenger confirmation, resets the request, and notifies both sides truthfully (never as a decline)", async () => {
    dbMocks.match.findMany.mockImplementation((args: { where: { status: string } }) =>
      args.where.status === "AWAITING_PASSENGER" ? [passengerAwaitingMatch] : [],
    );

    const result = await expireStaleMatches();

    expect(dbMocks.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-passenger-1", status: "AWAITING_PASSENGER" },
      data: { status: "EXPIRED" },
    });
    expect(dbMocks.tripRequest.update).toHaveBeenCalledWith({ where: { id: "req-2" }, data: { status: "PENDING" } });
    expect(logActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "match.expired_awaiting_passenger", entityId: "match-passenger-1" }));
    expect(notifyDriverPrivatelyMock).toHaveBeenCalledWith("tg-driver-2", messages.passengerResponseTimedOutForDriver.RU);
    expect(notifyPassengerTextMock).toHaveBeenCalledWith("wa-pax-2", messages.passengerResponseTimedOut.RU);
    expect(proposeMatchesForRequestMock).toHaveBeenCalledWith("req-2");
    expect(result.passengerTimeouts).toBe(1);
  });

  it("skips a passenger match that already got a real response before the sweep ran (race guard)", async () => {
    dbMocks.match.findMany.mockImplementation((args: { where: { status: string } }) =>
      args.where.status === "AWAITING_PASSENGER" ? [passengerAwaitingMatch] : [],
    );
    dbMocks.match.updateMany.mockResolvedValue({ count: 0 });

    await expireStaleMatches();

    expect(dbMocks.tripRequest.update).not.toHaveBeenCalled();
    expect(logActionMock).not.toHaveBeenCalled();
    expect(notifyDriverPrivatelyMock).not.toHaveBeenCalled();
    expect(notifyPassengerTextMock).not.toHaveBeenCalled();
    expect(proposeMatchesForRequestMock).not.toHaveBeenCalled();
  });
});
