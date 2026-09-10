import { describe, expect, it } from "vitest";
import { findCandidateOffers } from "./engine";
import type { MatchableOffer, MatchableRequest } from "./types";

const corridorId = "corridor-1";

function baseRequest(overrides: Partial<MatchableRequest> = {}): MatchableRequest {
  return {
    id: "request-1",
    origin: { id: "stop-origin", corridorId, order: 0 },
    destination: { id: "stop-dest", corridorId, order: 10 },
    travelDate: new Date("2026-09-15T00:00:00Z"),
    timeWindowStart: null,
    timeWindowEnd: null,
    seats: 2,
    ...overrides,
  };
}

function baseOffer(overrides: Partial<MatchableOffer> = {}): MatchableOffer {
  return {
    id: "offer-1",
    driverId: "driver-1",
    driverStatus: "ACTIVE",
    driverCategory: "UNKNOWN",
    origin: { id: "stop-origin", corridorId, order: 0 },
    destination: { id: "stop-dest", corridorId, order: 10 },
    travelDate: new Date("2026-09-15T00:00:00Z"),
    timeWindowStart: null,
    timeWindowEnd: null,
    seatsAvailable: 4,
    status: "OPEN",
    createdAt: new Date("2026-09-14T00:00:00Z"),
    ...overrides,
  };
}

describe("findCandidateOffers — Test 13: matching excludes an offer with fewer seats than requested", () => {
  it("never returns an offer whose seatsAvailable is below the requested seat count, including a fully sold-out (0-seat) offer", () => {
    const request = baseRequest({ seats: 2 });
    const soldOut = baseOffer({ id: "offer-sold-out", seatsAvailable: 0 });
    const tooFew = baseOffer({ id: "offer-too-few", seatsAvailable: 1 });
    const exact = baseOffer({ id: "offer-exact-fit", seatsAvailable: 2 });

    const candidates = findCandidateOffers(request, [soldOut, tooFew, exact]);

    expect(candidates.map((c) => c.offer.id)).toEqual(["offer-exact-fit"]);
  });

  it("re-includes the same offer once seatsAvailable is reported back at or above the requested seat count", () => {
    const request = baseRequest({ seats: 2 });
    const replenished = baseOffer({ id: "offer-replenished", seatsAvailable: 2 });

    const candidates = findCandidateOffers(request, [replenished]);

    expect(candidates.map((c) => c.offer.id)).toEqual(["offer-replenished"]);
  });
});

describe("findCandidateOffers — Test 15: RT-registered driver priority", () => {
  it("ranks an ANCHOR-category (established RT) driver's offer above an otherwise-identical UNKNOWN driver's offer", () => {
    const request = baseRequest();
    const unknownDriverOffer = baseOffer({ id: "offer-unknown", driverCategory: "UNKNOWN" });
    const anchorDriverOffer = baseOffer({ id: "offer-anchor", driverCategory: "ANCHOR" });

    const candidates = findCandidateOffers(request, [unknownDriverOffer, anchorDriverOffer]);

    expect(candidates.map((c) => c.offer.id)).toEqual(["offer-anchor", "offer-unknown"]);
    expect(candidates[0].score).toBeGreaterThan(candidates[1].score);
  });

  it("never lets RT-driver priority override a strictly better route/time fit for a competing offer", () => {
    // request wants a tight [08:00,08:15] pickup window.
    const request = baseRequest({ timeWindowStart: "08:00", timeWindowEnd: "08:15" });
    // ANCHOR driver's pickup window is far off (large time penalty).
    const anchorButFarOff = baseOffer({
      id: "offer-anchor-far",
      driverCategory: "ANCHOR",
      timeWindowStart: "10:00",
      timeWindowEnd: "10:15",
    });
    // UNKNOWN driver's pickup window matches exactly.
    const unknownButOnTime = baseOffer({
      id: "offer-unknown-on-time",
      driverCategory: "UNKNOWN",
      timeWindowStart: "08:00",
      timeWindowEnd: "08:15",
    });

    const candidates = findCandidateOffers(request, [anchorButFarOff, unknownButOnTime]);

    expect(candidates.map((c) => c.offer.id)).toEqual(["offer-unknown-on-time", "offer-anchor-far"]);
  });

  it("orders all driver categories monotonically by RT-established-ness when everything else is equal", () => {
    const request = baseRequest();
    const offers = (["UNKNOWN", "OCCASIONAL", "REGULAR", "DISPATCHER_FLEET", "ANCHOR"] as const).map((driverCategory) =>
      baseOffer({ id: `offer-${driverCategory}`, driverCategory }),
    );

    const candidates = findCandidateOffers(request, offers);

    expect(candidates.map((c) => c.offer.id)).toEqual([
      "offer-ANCHOR",
      "offer-DISPATCHER_FLEET",
      "offer-REGULAR",
      "offer-OCCASIONAL",
      "offer-UNKNOWN",
    ]);
  });
});
