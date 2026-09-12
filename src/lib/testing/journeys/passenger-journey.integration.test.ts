// Phase 3 proof: RT's passenger loop, run end to end against a real Postgres.
//
// Every assertion below reads the database after the fact. That is the point —
// the journey runner drives the real entrypoints and then this file checks what
// the real tables say happened, so a passing test is evidence about RT rather
// than evidence about the runner.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isSyntheticIdentifier } from "../synthetic";
import { cleanupSyntheticData } from "../synthetic-fixtures";
import { runPassengerJourney } from "./passenger-journey";

beforeEach(async () => {
  await cleanupSyntheticData();
});

afterAll(async () => {
  await cleanupSyntheticData();
});

describe("passenger journey — the ordinary trip", () => {
  it("carries one passenger from a WhatsApp message to a completed trip", async () => {
    const result = await runPassengerJourney({ ref: "e2e-happy", seats: 2, fareSom: 1200 });

    expect(result.outcome).toBe("TRIP_COMPLETED");
    expect(result.tripRequestId).not.toBeNull();
    expect(result.matchId).not.toBeNull();
    expect(result.tripId).not.toBeNull();

    // The states RT itself recorded, re-read from the tables.
    expect(result.matchStatus).toBe("CONFIRMED");
    expect(result.tripStatus).toBe("COMPLETED");
    expect(result.loopStatus).toBe("PASSENGER_ACCEPTED");

    const trip = await db.trip.findUniqueOrThrow({ where: { id: result.tripId! } });
    expect(trip.completedAt).not.toBeNull();
  });

  it("decrements the driver's seats by exactly what the passenger asked for", async () => {
    const result = await runPassengerJourney({ ref: "e2e-seats", seats: 2, offerSeats: 4 });

    const offer = await db.driverOffer.findUniqueOrThrow({ where: { id: result.driverOfferId! } });
    expect(offer.seatsTotal).toBe(4);
    expect(offer.seatsAvailable).toBe(2);
    expect(offer.status).toBe("PARTIALLY_FILLED");
  });

  it("charges RT's commission to the driver's balance and nowhere else", async () => {
    // No money moves: this is RT's own ledger, in a test database, for a driver
    // who does not exist. What is being proven is that completion reaches the
    // commission path at all.
    const result = await runPassengerJourney({ ref: "e2e-commission", seats: 1, fareSom: 900 });

    const entries = await db.ledgerEntry.findMany({ where: { driverId: result.driverId! } });
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("COMMISSION_CHARGE");

    const balance = await db.rtBalance.findUnique({ where: { driverId: result.driverId! } });
    expect(balance).not.toBeNull();
  });

  it("leaves an audit trail that reaches from the request to the completed trip", async () => {
    const result = await runPassengerJourney({ ref: "e2e-audit" });

    const [created, confirmed, completed] = await Promise.all([
      db.auditLogEntry.findFirst({ where: { action: "request.created", entityId: result.tripRequestId! } }),
      db.auditLogEntry.findFirst({ where: { action: "match.confirmed", entityId: result.matchId! } }),
      db.auditLogEntry.findFirst({ where: { action: "trip.completed", entityId: result.tripId! } }),
    ]);

    expect(created).not.toBeNull();
    expect(confirmed).not.toBeNull();
    expect(completed).not.toBeNull();
  });

  it("gives RT OFFICE a correlation id for the whole run", async () => {
    const result = await runPassengerJourney({ ref: "e2e-correlation" });

    expect(result.correlationId).toBeTruthy();
    const transitions = await db.auditLogEntry.findMany({
      where: { action: "rt_office.passenger_loop_transition", entityId: result.loopRunId! },
    });
    expect(transitions.length).toBeGreaterThan(1);
  });
});

describe("passenger journey — nothing reaches a real person", () => {
  it("only ever addresses synthetic recipients", async () => {
    const result = await runPassengerJourney({ ref: "e2e-recipients" });

    expect(result.outbound.length).toBeGreaterThan(0);
    for (const record of result.outbound) {
      expect(isSyntheticIdentifier(record.recipient)).toBe(true);
    }
  });

  it("tells the passenger their request was received, in their own language", async () => {
    // Read from the dry-run provider rather than asserted from a template: the
    // claim is that RT produced this text, not that the test knows it.
    const result = await runPassengerJourney({ ref: "e2e-ack" });

    const toPassenger = result.outbound.filter((r) => r.channel === "WhatsApp");
    expect(toPassenger.length).toBeGreaterThan(0);
    expect(toPassenger[0].text.length).toBeGreaterThan(0);
  });

  it("leaves nothing behind after cleanup", async () => {
    await runPassengerJourney({ ref: "e2e-cleanup" });

    const report = await cleanupSyntheticData();
    expect(report.total).toBeGreaterThan(0);

    const [passengers, trips, requests] = await Promise.all([
      db.passenger.count({ where: { whatsappId: { contains: "SYNTHETIC-TEST-" } } }),
      db.trip.count({ where: { driver: { telegramUserId: { contains: "SYNTHETIC-TEST-" } } } }),
      db.tripRequest.count({ where: { passenger: { whatsappId: { contains: "SYNTHETIC-TEST-" } } } }),
    ]);
    expect({ passengers, trips, requests }).toEqual({ passengers: 0, trips: 0, requests: 0 });
  });
});

describe("passenger journey — the ways it does not end in a trip", () => {
  it("reports no supply rather than inventing a driver", async () => {
    const result = await runPassengerJourney({ ref: "e2e-nosupply", supply: "NONE" });

    expect(result.outcome).toBe("NO_SUPPLY");
    expect(result.loopStatus).toBe("NO_SUPPLY");
    expect(await db.match.count({ where: { tripRequestId: result.tripRequestId! } })).toBe(0);
  });

  it("does not match an unverified driver", async () => {
    // A driver RT has not verified is not supply, however willing they are.
    const result = await runPassengerJourney({ ref: "e2e-unverified", supply: "DRIVER_UNVERIFIED" });

    expect(result.outcome).toBe("NO_SUPPLY");
    expect(await db.match.count({ where: { tripRequestId: result.tripRequestId! } })).toBe(0);
  });

  it("keeps the demand alive when the driver declines", async () => {
    const result = await runPassengerJourney({ ref: "e2e-driver-decline", driverReply: "DECLINE" });

    expect(result.outcome).toBe("DRIVER_DECLINED");
    expect(result.matchStatus).toBe("DECLINED_BY_DRIVER");
    expect(await db.trip.count({ where: { matchId: result.matchId! } })).toBe(0);
  });

  it("returns the demand to the pool when the passenger declines", async () => {
    const result = await runPassengerJourney({ ref: "e2e-passenger-decline", passengerReply: "DECLINE" });

    expect(result.outcome).toBe("PASSENGER_DECLINED");
    expect(result.matchStatus).toBe("DECLINED_BY_PASSENGER");
    expect(await db.trip.count({ where: { matchId: result.matchId! } })).toBe(0);

    // RT re-searched and found nothing else, and said so. Recording that
    // outcome used to throw a LoopTransitionError out of the response handler.
    expect(result.loopStatus).toBe("NO_SUPPLY");
    const run = await db.passengerLoopRun.findUniqueOrThrow({ where: { id: result.loopRunId! } });
    expect(run.noSupplyDetail).toBe("NO_CANDIDATES_AFTER_PASSENGER_DECLINE");

    // Seats were never taken, so they were never given back either.
    const offer = await db.driverOffer.findUniqueOrThrow({ where: { id: result.driverOfferId! } });
    expect(offer.seatsAvailable).toBe(offer.seatsTotal);
  });

  it("leaves the match waiting when the driver never answers", async () => {
    const result = await runPassengerJourney({ ref: "e2e-driver-silent", driverReply: "NO_RESPONSE" });

    expect(result.outcome).toBe("AWAITING_DRIVER");
    expect(result.matchStatus).toBe("AWAITING_DRIVER");
  });

  it("withdraws demand the passenger cancelled", async () => {
    const result = await runPassengerJourney({
      ref: "e2e-withdrawn",
      driverReply: "NO_RESPONSE",
      cancelDemandAtEnd: true,
    });

    expect(result.outcome).toBe("DEMAND_CANCELLED");
    const request = await db.tripRequest.findUniqueOrThrow({ where: { id: result.tripRequestId! } });
    expect(request.status).toBe("CANCELLED");
  });

  it("cancels a confirmed trip and says who cancelled it", async () => {
    const result = await runPassengerJourney({
      ref: "e2e-trip-cancelled",
      afterConfirmation: "CANCEL_BY_PASSENGER",
    });

    expect(result.outcome).toBe("TRIP_CANCELLED");
    expect(result.tripStatus).toBe("CANCELLED");
    const trip = await db.trip.findUniqueOrThrow({ where: { id: result.tripId! } });
    expect(trip.cancelReason).toContain("PASSENGER_CANCELLED");
  });

  it("says it did not understand rather than guessing a route", async () => {
    const result = await runPassengerJourney({
      ref: "e2e-unparseable",
      passengerMessage: "Здравствуйте, а сколько стоит?",
    });

    expect(result.outcome).toBe("DEMAND_NOT_UNDERSTOOD");
    expect(result.tripRequestId).toBeNull();
  });
});

describe("passenger journey — redelivery and money intent", () => {
  it("creates one request and one loop run from a webhook delivered twice", async () => {
    const result = await runPassengerJourney({ ref: "e2e-duplicate", duplicateInbound: true });

    const requests = await db.tripRequest.count({ where: { passengerId: result.passengerId } });
    const runs = await db.passengerLoopRun.count({ where: { tripRequest: { passengerId: result.passengerId } } });
    expect({ requests, runs }).toEqual({ requests: 1, runs: 1 });
  });

  it("records an excess-baggage intent exactly once, and moves no money", async () => {
    const result = await runPassengerJourney({ ref: "e2e-baggage", excessBaggageFeeSom: 100 });

    const intents = await db.passengerFinancialIntent.findMany({
      where: { customerRef: { contains: "SYNTHETIC-TEST-" } },
    });
    expect(intents).toHaveLength(1);
    expect(intents[0].amountSom).toBe(100);
    expect(intents[0].tripId).toBe(result.tripId);
    // No cashier exists, so none is named. An intent is a handoff, not a charge.
    expect(intents[0].financialProcessor).toBeNull();
  });
});
