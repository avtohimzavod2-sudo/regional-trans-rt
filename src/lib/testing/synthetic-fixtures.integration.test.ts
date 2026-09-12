// Phase 4 proof, against a real Postgres.
//
// The claims synthetic-fixtures.ts makes are claims about a database: that the
// rows are real rows in the real tables, that a full trip chain built on them
// can be removed afterwards, and that the removal order satisfies the actual
// foreign keys. None of that is checkable with a mocked client — a mock accepts
// any delete order, including one Postgres would reject.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/messaging/telegram";
import { sendWhatsAppText } from "@/lib/messaging/whatsapp";
import { SYNTHETIC_MARKER, SyntheticRecipientError } from "./synthetic";
import {
  cleanupSyntheticData,
  countSyntheticEntities,
  createSyntheticDriver,
  createSyntheticPassenger,
  ensureSyntheticGeography,
  SYNTHETIC_CORRIDOR_KEY,
} from "./synthetic-fixtures";

beforeEach(async () => {
  await cleanupSyntheticData();
});

afterAll(async () => {
  await cleanupSyntheticData();
});

/** Builds the full passenger chain a real trip produces, so cleanup is tested
 * against the shape it will actually meet rather than three bare rows. */
async function buildFullTripChain(ref: string) {
  const geo = await ensureSyntheticGeography();
  const passenger = await createSyntheticPassenger({ ref });
  const driver = await createSyntheticDriver({ ref });
  const travelDate = new Date("2026-10-01T00:00:00.000Z");

  const request = await db.tripRequest.create({
    data: {
      passengerId: passenger.id,
      originStopId: geo.originStopId,
      destinationStopId: geo.destinationStopId,
      travelDate,
      seats: 1,
    },
  });
  const offer = await db.driverOffer.create({
    data: {
      driverId: driver.id,
      originStopId: geo.originStopId,
      destinationStopId: geo.destinationStopId,
      travelDate,
      seatsTotal: 4,
      seatsAvailable: 4,
    },
  });
  const match = await db.match.create({
    data: { tripRequestId: request.id, driverOfferId: offer.id, status: "CONFIRMED" },
  });
  const trip = await db.trip.create({
    data: {
      matchId: match.id,
      driverId: driver.id,
      passengerId: passenger.id,
      driverOfferId: offer.id,
      seats: 1,
    },
  });
  const loopRun = await db.passengerLoopRun.create({
    data: { tripRequestId: request.id, correlationId: `${SYNTHETIC_MARKER}trace-${ref}` },
  });
  await db.passengerLoopOffer.create({
    data: { loopRunId: loopRun.id, matchId: match.id, driverOfferId: offer.id },
  });
  await db.rtBalance.create({ data: { driverId: driver.id, balanceSom: 0 } });
  await db.ledgerEntry.create({
    data: {
      driverId: driver.id,
      tripId: trip.id,
      type: "COMMISSION_CHARGE",
      amountSom: -50,
      actorType: "SYSTEM",
    },
  });
  await db.auditLogEntry.create({
    data: {
      actorType: "SYSTEM",
      action: "trip.completed",
      entityType: "Trip",
      entityId: `${SYNTHETIC_MARKER}trip-${ref}`,
      traceId: `${SYNTHETIC_MARKER}trace-${ref}`,
    },
  });

  return { geo, passenger, driver, request, offer, match, trip };
}

describe("synthetic fixtures, against a real database", () => {
  it("creates ordinary rows in the ordinary tables, not a parallel test store", async () => {
    const geo = await ensureSyntheticGeography();
    const passenger = await createSyntheticPassenger({ ref: 1 });
    const driver = await createSyntheticDriver({ ref: 1 });

    // Read back through plain queries with no marker filter: if the fixtures
    // were writing somewhere special, these would come back empty.
    expect(await db.passenger.findUnique({ where: { id: passenger.id } })).not.toBeNull();
    expect(await db.driver.findUnique({ where: { id: driver.id } })).not.toBeNull();
    expect(await db.stop.count({ where: { corridorId: geo.corridorId } })).toBe(3);
  });

  it("marks every identifier that could reach a person", async () => {
    const passenger = await createSyntheticPassenger({ ref: "marked" });
    const driver = await createSyntheticDriver({ ref: "marked" });

    for (const value of [passenger.whatsappId, passenger.phone, driver.telegramUserId, driver.phone, driver.carPlate]) {
      expect(value).toContain(SYNTHETIC_MARKER);
    }
  });

  it("produces entities the real send boundary refuses", async () => {
    // The point of the marker, end to end: not "a test remembers not to send",
    // but the production send functions rejecting the row they were handed.
    process.env.TELEGRAM_BOT_TOKEN = "integration-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "integration-phone-id";
    process.env.WHATSAPP_ACCESS_TOKEN = "integration-access-token";

    const passenger = await createSyntheticPassenger({ ref: "unreachable" });
    const driver = await createSyntheticDriver({ ref: "unreachable" });

    await expect(sendWhatsAppText(passenger.whatsappId, "hi")).rejects.toThrow(SyntheticRecipientError);
    await expect(sendTelegramMessage(driver.telegramUserId, "hi")).rejects.toThrow(SyntheticRecipientError);
  });

  it("is idempotent, so a scenario batch does not accumulate duplicates", async () => {
    const first = await ensureSyntheticGeography();
    const passengerA = await createSyntheticPassenger({ ref: 7 });
    const second = await ensureSyntheticGeography();
    const passengerB = await createSyntheticPassenger({ ref: 7 });

    expect(second.corridorId).toBe(first.corridorId);
    expect(second.stopIds).toEqual(first.stopIds);
    expect(passengerB.id).toBe(passengerA.id);
    expect(await db.corridor.count({ where: { key: SYNTHETIC_CORRIDOR_KEY } })).toBe(1);
  });

  it("gives distinct refs distinct entities", async () => {
    const a = await createSyntheticDriver({ ref: "a" });
    const b = await createSyntheticDriver({ ref: "b" });
    expect(a.id).not.toBe(b.id);
    expect(a.telegramUserId).not.toBe(b.telegramUserId);
  });

  it("removes a full trip chain in an order Postgres accepts, and reports what it removed", async () => {
    const { trip, request } = await buildFullTripChain("chain");

    const report = await cleanupSyntheticData();

    expect(report.deleted.Trip).toBe(1);
    expect(report.deleted.Match).toBe(1);
    expect(report.deleted.TripRequest).toBe(1);
    expect(report.deleted.DriverOffer).toBe(1);
    expect(report.deleted.PassengerLoopRun).toBe(1);
    expect(report.deleted.PassengerLoopOffer).toBe(1);
    expect(report.deleted.LedgerEntry).toBe(1);
    expect(report.deleted.RtBalance).toBe(1);
    expect(report.deleted.AuditLogEntry).toBe(1);
    expect(report.deleted.Driver).toBe(1);
    expect(report.deleted.Passenger).toBe(1);
    expect(report.deleted.Stop).toBe(3);
    expect(report.deleted.Corridor).toBe(1);
    expect(report.total).toBeGreaterThanOrEqual(14);

    // Verified against the database rather than against the report cleanup
    // wrote about itself.
    expect(await db.trip.findUnique({ where: { id: trip.id } })).toBeNull();
    expect(await db.tripRequest.findUnique({ where: { id: request.id } })).toBeNull();
    expect(await countSyntheticEntities()).toEqual({ passengers: 0, drivers: 0, corridors: 0 });
  });

  it("leaves non-synthetic rows alone", async () => {
    // Cleanup is scoped by marker, not "empty the database". A real seeded
    // corridor sitting next to the test data must survive, or every scenario
    // after the first is running against different geography.
    const realCorridor = await db.corridor.upsert({
      where: { key: "integration-real-corridor" },
      update: {},
      create: {
        key: "integration-real-corridor",
        nameRu: "Настоящий",
        nameKy: "Чыныгы",
        nameEn: "Real",
      },
    });
    await buildFullTripChain("scoped");

    await cleanupSyntheticData();

    expect(await db.corridor.findUnique({ where: { id: realCorridor.id } })).not.toBeNull();
    await db.corridor.delete({ where: { id: realCorridor.id } });
  });

  it("is safe to run twice, and reports honest zeroes the second time", async () => {
    await buildFullTripChain("twice");

    const first = await cleanupSyntheticData();
    const second = await cleanupSyntheticData();

    expect(first.total).toBeGreaterThan(0);
    expect(second.total).toBe(0);
  });
});
