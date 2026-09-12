// Phase 6 proof: one question, answered from the database.
//
// The question is the Founder's — "что произошло с заказом X от первого
// сообщения до финального состояния?" — and the test is whether it can be
// answered by reading one timeline instead of joining nine tables by hand.
//
// So these tests run real journeys through the real loop and then interrogate
// the timeline the way a person would: from whichever id they happen to be
// holding, looking for the moment it went wrong, the money, the duplicate, and
// the parts of RT that never got involved.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { runPassengerJourney } from "@/lib/testing/journeys/passenger-journey";
import { cleanupSyntheticData } from "@/lib/testing/synthetic-fixtures";
import { buildOrderTimeline, formatOrderTimeline, maskIdentifier } from "./order-timeline";

// Its own slice of the calendar, for the same reason every batch has one:
// matching is keyed on an exact travel date, so a date nobody else uses is
// what keeps these journeys away from the scenario engine's supply.
const DAY = 600;

beforeAll(async () => {
  await cleanupSyntheticData();
});

describe("order timeline — a completed trip", () => {
  it("tells the whole story from the first message to the closed trip", async () => {
    const journey = await runPassengerJourney({
      ref: "timeline-complete",
      daysAhead: DAY,
      afterConfirmation: "COMPLETE",
      fareSom: 500,
      excessBaggageFeeSom: 100,
    });
    expect(journey.outcome).toBe("TRIP_COMPLETED");

    const timeline = await buildOrderTimeline(journey.tripRequestId!);

    expect(timeline.found).toBe(true);
    expect(timeline.derivedOutcome).toBe("TRIP_COMPLETED");

    // Every identifier the Founder asked for, on one object.
    expect(timeline.identity.correlationId).toBe(journey.correlationId);
    expect(timeline.identity.tripRequestId).toBe(journey.tripRequestId);
    expect(timeline.identity.passengerId).toBe(journey.passengerId);
    expect(timeline.identity.driverId).toBe(journey.driverId);
    expect(timeline.identity.driverOfferId).toBe(journey.driverOfferId);
    expect(timeline.identity.tripId).toBe(journey.tripId);
    expect(timeline.identity.matchIds).toContain(journey.matchId);
    expect(timeline.identity.rawMessageId).not.toBeNull();

    // It is ordered. A timeline that is not is not a timeline.
    const times = timeline.events.map((e) => e.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    // The demand starts with a message from a person, and everything RT did
    // about this order comes after it.
    //
    // Not "the first event is the inbound message": the car was on offer
    // before the passenger asked for it, so the driver's offer legitimately
    // precedes the demand. That supply history is part of this order's story
    // — which car this was and when it was posted — so the timeline keeps it,
    // and what has to hold is that nothing about the *demand* predates the
    // message that created it.
    const inbound = timeline.events.filter((e) => e.source === "INBOUND");
    expect(inbound).toHaveLength(1);
    expect(inbound[0].contour).toBe("MIRA");

    const demandEntities = new Set(["TripRequest", "PassengerLoopRun", "PassengerLoopOffer", "Match", "Trip"]);
    const firstDemandEvent = timeline.events.findIndex((e) => demandEntities.has(e.entityType ?? ""));
    expect(timeline.events.indexOf(inbound[0])).toBeLessThan(firstDemandEvent);

    // And everything before the message is about the supply, not the demand.
    const before = timeline.events.slice(0, timeline.events.indexOf(inbound[0]));
    expect(before.every((e) => e.entityType === "DriverOffer" || e.entityType === "RawMessage")).toBe(true);

    // The lifecycle, in the order it has to have happened in.
    const keys = timeline.events.map((e) => e.key);
    for (const expected of ["request.created", "match.proposed_to_driver", "match.confirmed", "trip.completed"]) {
      expect(keys, `${expected} missing from the timeline`).toContain(expected);
    }
    expect(keys.indexOf("request.created")).toBeLessThan(keys.indexOf("match.confirmed"));
    expect(keys.indexOf("match.confirmed")).toBeLessThan(keys.indexOf("trip.completed"));

    // RT OFFICE's loop transitions are there, with the status each moved to.
    const transitions = timeline.events.filter((e) => e.key === "rt_office.passenger_loop_transition");
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.map((e) => e.statusTo)).toContain("OFFER_READY");
    expect(transitions.every((e) => e.contour === "RT_OFFICE")).toBe(true);

    // Every transition names the order it belongs to, and it is this order.
    expect(transitions.every((e) => e.orderCorrelationId === journey.correlationId)).toBe(true);
    // And it records what caused the transition, which is why causationId is
    // populated here and null on rows that do not record one.
    expect(transitions.every((e) => e.causationId !== null)).toBe(true);

    // The distinction that matters, asserted rather than assumed: the row's
    // own traceId is the trace of the webhook that wrote it, so an order
    // worked over several inbound events carries several of them and no one
    // of them identifies the order. It is orderCorrelationId that does.
    const traces = new Set(transitions.map((e) => e.correlationId));
    expect(traces.size).toBeGreaterThan(1);
    expect(new Set(transitions.map((e) => e.orderCorrelationId)).size).toBe(1);
    // Which is a real limitation of RT's correlation today, so the timeline
    // has to say so out loud rather than let a reader trust traceId.
    expect(timeline.gaps.some((g) => g.includes("per-invocation, not per-order"))).toBe(true);

    // Money: an intent Mira recorded, and RT's own commission. Neither is a
    // payment, and the timeline must show both without conflating them.
    const intents = timeline.events.filter((e) => e.source === "FINANCE");
    expect(intents).toHaveLength(1);
    expect(intents[0].contour).toBe("MIRA");
    expect(intents[0].summary).toContain("none appointed");

    const ledger = timeline.events.filter((e) => e.source === "LEDGER");
    expect(ledger.map((e) => e.key)).toEqual(["ledger.COMMISSION_CHARGE"]);
    expect(ledger[0].contour).toBe("TREASURY");

    expect(timeline.states.trip?.status).toBe("COMPLETED");
    expect(timeline.states.request?.status).toBe("CONFIRMED");
    expect(timeline.states.loopOffers.map((o) => o.matchId)).toContain(journey.matchId);
  }, 120_000);

  it("answers from any handle a person might be holding", async () => {
    const journey = await runPassengerJourney({
      ref: "timeline-handles",
      daysAhead: DAY + 2,
      afterConfirmation: "COMPLETE",
    });

    const handles: Array<[string, string]> = [
      [journey.tripRequestId!, "tripRequestId"],
      [journey.correlationId!, "correlationId"],
      [journey.loopRunId!, "loopRunId"],
      [journey.matchId!, "matchId"],
      [journey.tripId!, "tripId"],
    ];

    for (const [handle, expectedResolver] of handles) {
      const timeline = await buildOrderTimeline(handle);
      expect(timeline.found, `${expectedResolver} did not resolve`).toBe(true);
      expect(timeline.resolvedBy).toBe(expectedResolver);
      // Different doors, same order.
      expect(timeline.identity.tripRequestId).toBe(journey.tripRequestId);
    }
  }, 120_000);

  it("says plainly when the handle is not one of ours", async () => {
    const timeline = await buildOrderTimeline("not-an-id-at-all");
    expect(timeline.found).toBe(false);
    expect(timeline.derivedOutcome).toBe("NOT_FOUND");
    expect(timeline.events).toEqual([]);
    // Not an empty object pretending to be an order.
    expect(formatOrderTimeline(timeline)).toContain("No order matches");
  });
});

describe("order timeline — the contours an order passed through", () => {
  it("names them in the order the order reached them", async () => {
    const journey = await runPassengerJourney({
      ref: "timeline-contours",
      daysAhead: DAY + 4,
      afterConfirmation: "COMPLETE",
      fareSom: 400,
    });
    const timeline = await buildOrderTimeline(journey.tripRequestId!);

    // The chain the Founder described: the contact surface, the core, RT
    // OFFICE, CRM Авто's operational record, and the treasury once there is
    // commission to book.
    for (const contour of ["MIRA", "RT_CORE", "RT_OFFICE", "CRM_AUTO", "TREASURY"] as const) {
      expect(timeline.contourPath, `${contour} never appears`).toContain(contour);
    }

    // Money is last. Whatever order the rest arrives in, RT does not book
    // commission before the order exists.
    expect(timeline.contourPath.indexOf("MIRA")).toBeLessThan(timeline.contourPath.indexOf("TREASURY"));

    // Nothing unattributed. An action from a contour nobody mapped would show
    // as OTHER, and that is a finding about the mapping, not a pass.
    expect(timeline.events.filter((e) => e.contour === "OTHER").map((e) => e.key)).toEqual([]);

    // No human touched this order, and the timeline must not imply one did.
    expect(timeline.events.filter((e) => e.contour === "HUMAN")).toEqual([]);

    // Жолчу was not needed: this demand parsed deterministically and no route
    // question was asked. The absence is honest, not a hole — but it does mean
    // the timeline has to say why it cannot show route work.
    expect(timeline.contourPath).not.toContain("JOLCHU");
  }, 120_000);
});

describe("order timeline — when something went wrong", () => {
  it("surfaces a redelivered webhook as a duplicate, not as two orders", async () => {
    const journey = await runPassengerJourney({
      ref: "timeline-duplicate",
      daysAhead: DAY + 6,
      duplicateInbound: true,
      afterConfirmation: "COMPLETE",
    });

    const timeline = await buildOrderTimeline(journey.tripRequestId!);

    expect(timeline.retries.map((e) => e.key)).toContain("request.duplicate_ignored");
    // One order, not two. The duplicate is visible and it did not act.
    expect(timeline.events.filter((e) => e.key === "request.created")).toHaveLength(1);
    expect(timeline.derivedOutcome).toBe("TRIP_COMPLETED");
    expect(formatOrderTimeline(timeline)).toContain("duplicate/retry");
  }, 120_000);

  it("shows why an order found no car, with the reason RT recorded", async () => {
    const journey = await runPassengerJourney({
      ref: "timeline-no-supply",
      daysAhead: DAY + 8,
      supply: "NONE",
    });
    expect(journey.outcome).toBe("NO_SUPPLY");

    const timeline = await buildOrderTimeline(journey.correlationId!);

    expect(timeline.derivedOutcome).toBe("NO_SUPPLY");
    expect(timeline.states.loopRun?.status).toBe("NO_SUPPLY");
    expect(timeline.states.loopRun?.noSupplyReason).not.toBeNull();
    // The story stops where it really stopped: no match, no trip, no money.
    expect(timeline.identity.tripId).toBeNull();
    expect(timeline.identity.matchIds).toEqual([]);
    expect(timeline.events.filter((e) => e.source === "LEDGER")).toEqual([]);
    expect(formatOrderTimeline(timeline)).toContain("NO_SUPPLY");
  }, 120_000);

  it("keeps a cancelled trip's history instead of erasing it", async () => {
    const journey = await runPassengerJourney({
      ref: "timeline-cancelled",
      daysAhead: DAY + 10,
      afterConfirmation: "CANCEL_BY_PASSENGER",
    });
    expect(journey.outcome).toBe("TRIP_CANCELLED");

    const timeline = await buildOrderTimeline(journey.tripId!);

    expect(timeline.derivedOutcome).toBe("TRIP_CANCELLED");
    // The confirmation still happened. A cancellation is the end of the story,
    // not a rewrite of it.
    const keys = timeline.events.map((e) => e.key);
    expect(keys).toContain("match.confirmed");
    expect(keys).toContain("trip.cancelled");
    expect(keys.indexOf("match.confirmed")).toBeLessThan(keys.indexOf("trip.cancelled"));
  }, 120_000);
});

describe("order timeline — data minimisation", () => {
  it("carries no contact identifier or message body by default", async () => {
    const journey = await runPassengerJourney({
      ref: "timeline-redaction",
      daysAhead: DAY + 12,
      afterConfirmation: "COMPLETE",
    });

    const timeline = await buildOrderTimeline(journey.tripRequestId!);
    const rendered = formatOrderTimeline(timeline);

    // The synthetic passenger's chat id is a stand-in for a phone number, and
    // it must not appear in full anywhere in the timeline or its rendering.
    const { whatsappId } = await db.passenger.findUniqueOrThrow({
      where: { id: journey.passengerId },
      select: { whatsappId: true },
    });

    expect(rendered).not.toContain(whatsappId);
    expect(JSON.stringify(timeline)).not.toContain(whatsappId);
    // Masked, not merely absent: an operator still has to be able to tell two
    // passengers apart on two timelines.
    expect(rendered).toContain(maskIdentifier(whatsappId));

    // The inbound text is reduced to its length.
    const inbound = timeline.events.find((e) => e.source === "INBOUND")!;
    expect(inbound.summary).toMatch(/<redacted, \d+ chars>/);
    expect(timeline.gaps.some((g) => g.includes("redacted"))).toBe(true);
  }, 120_000);

  it("hands over the real text when an investigation asks for it", async () => {
    const journey = await runPassengerJourney({
      ref: "timeline-reveal",
      daysAhead: DAY + 14,
      afterConfirmation: "COMPLETE",
    });

    const timeline = await buildOrderTimeline(journey.tripRequestId!, { reveal: true });
    const inbound = timeline.events.find((e) => e.source === "INBOUND")!;

    expect(inbound.summary).not.toMatch(/<redacted/);
    // The passenger asked for a car, in words.
    expect(inbound.summary).toContain("Ищу");
    expect(timeline.gaps.some((g) => g.includes("redacted"))).toBe(false);
  }, 120_000);
});

describe("order timeline — honesty about itself", () => {
  it("declares what it cannot tell you", async () => {
    const journey = await runPassengerJourney({
      ref: "timeline-gaps",
      daysAhead: DAY + 16,
      afterConfirmation: "COMPLETE",
    });
    const timeline = await buildOrderTimeline(journey.tripRequestId!);

    // Three real limitations, not disclaimers: outbound text is never stored,
    // input statuses are stitched rather than read, and most audit rows have
    // no traceId because logAction() does not take one.
    expect(timeline.gaps.some((g) => g.includes("Outbound message bodies are not stored"))).toBe(true);
    expect(timeline.gaps.some((g) => g.includes("stitched"))).toBe(true);
    expect(timeline.gaps.some((g) => g.includes("traceId"))).toBe(true);

    // The stitching itself has to be right where it applies: an input status
    // is only ever the previous recorded status of that same entity.
    const loop = timeline.events.filter((e) => e.entityType === "PassengerLoopRun" && e.statusTo !== null);
    expect(loop.length).toBeGreaterThan(1);
    expect(loop[0].statusFrom).toBeNull();
    for (let i = 1; i < loop.length; i++) {
      expect(loop[i].statusFrom).toBe(loop[i - 1].statusTo);
    }
  }, 120_000);
});
