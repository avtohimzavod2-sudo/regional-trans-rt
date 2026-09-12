// Synthetic passengers, drivers, vehicles and geography — real rows in the
// real tables, marked so they can never be mistaken for or reach a real person.
//
// These create ordinary Passenger/Driver/Corridor/Stop records through the
// ordinary Prisma client, on purpose. Proving RT's operational loop means
// running the real matching, the real CRM and the real send boundary; a
// parallel "test mode" with its own storage would prove that the test mode
// works. What makes them safe is not a separate code path, it is:
//
//   1. every identifier a message could be sent to carries SYNTHETIC_MARKER,
//      so the four real send functions refuse it (synthetic.ts);
//   2. every creator calls assertSyntheticContour() first, so the rows cannot
//      physically exist in a database RT would report KPI from;
//   3. cleanupSyntheticData() removes them by marker and reports what it
//      removed, so a run stays auditable after the fact.
//
// There is no Vehicle table in this schema — a vehicle is Driver.carModel /
// Driver.carPlate — so the synthetic vehicle is the marked plate on a marked
// driver rather than a row of its own.
import type { Language, DriverStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertSyntheticContour, SYNTHETIC_MARKER, syntheticId } from "./synthetic";

/** The corridor every synthetic trip runs on. One shared corridor rather than
 * one per test: stop keys are unique per corridor, and a corridor per test
 * would make "delete everything synthetic" depend on knowing every test's
 * name. */
export const SYNTHETIC_CORRIDOR_KEY = syntheticId("corridor", "main");

/** Ordered along the corridor, so `order` comparisons in the matching code
 * behave the way they do on the real Bishkek–Karakol corridor. */
export const SYNTHETIC_STOP_KEYS = [
  syntheticId("stop", "origin"),
  syntheticId("stop", "midpoint"),
  syntheticId("stop", "destination"),
] as const;

/** The stop names, exported because a passenger message has to contain one for
 * extraction to resolve it. Two copies of these strings — one here, one in
 * whatever writes the message — would be a scenario that silently stops
 * matching any stop the day someone renames one. */
export const SYNTHETIC_STOP_NAMES_RU = ["ТЕСТ остановка 1", "ТЕСТ остановка 2", "ТЕСТ остановка 3"] as const;
export const SYNTHETIC_STOP_NAMES_KY = ["СЫНОО аялдама 1", "СЫНОО аялдама 2", "СЫНОО аялдама 3"] as const;
export const SYNTHETIC_STOP_NAMES_EN = [
  "SYNTHETIC TEST stop 1",
  "SYNTHETIC TEST stop 2",
  "SYNTHETIC TEST stop 3",
] as const;

export interface SyntheticGeography {
  corridorId: string;
  /** Stop ids in corridor order: origin, midpoint, destination. */
  stopIds: [string, string, string];
  originStopId: string;
  midpointStopId: string;
  destinationStopId: string;
}

/** Creates (or reuses) the synthetic corridor and its three stops.
 *
 * Idempotent via upsert on the natural keys, so a scenario batch that calls it
 * once per scenario does not accumulate geography. */
export async function ensureSyntheticGeography(): Promise<SyntheticGeography> {
  assertSyntheticContour();

  const corridor = await db.corridor.upsert({
    where: { key: SYNTHETIC_CORRIDOR_KEY },
    update: {},
    create: {
      key: SYNTHETIC_CORRIDOR_KEY,
      nameRu: "ТЕСТОВЫЙ коридор",
      nameKy: "СЫНОО коридору",
      nameEn: "SYNTHETIC TEST corridor",
    },
  });

  const stopIds: string[] = [];
  for (const [index, key] of SYNTHETIC_STOP_KEYS.entries()) {
    const stop = await db.stop.upsert({
      where: { corridorId_key: { corridorId: corridor.id, key } },
      update: {},
      create: {
        corridorId: corridor.id,
        key,
        nameRu: SYNTHETIC_STOP_NAMES_RU[index],
        nameKy: SYNTHETIC_STOP_NAMES_KY[index],
        nameEn: SYNTHETIC_STOP_NAMES_EN[index],
        order: index,
        // No aliases. Aliases feed the NLP stop matcher, and a synthetic stop
        // that answers to a real place name would let a real inbound message
        // resolve onto test geography.
        aliases: [],
      },
    });
    stopIds.push(stop.id);
  }

  const [originStopId, midpointStopId, destinationStopId] = stopIds;
  return {
    corridorId: corridor.id,
    stopIds: [originStopId, midpointStopId, destinationStopId],
    originStopId,
    midpointStopId,
    destinationStopId,
  };
}

export interface SyntheticPassengerOptions {
  /** Distinguishes this passenger from the others in the same run. Anything
   * stable and unique: a loop index, a scenario id. */
  ref: string | number;
  name?: string;
  phone?: string | null;
  preferredLang?: Language;
}

/** Creates (or reuses) a synthetic passenger. `whatsappId` carries the marker,
 * which is what makes every send path refuse them. */
export async function createSyntheticPassenger(opts: SyntheticPassengerOptions) {
  assertSyntheticContour();

  const whatsappId = syntheticId("wa", opts.ref);
  return db.passenger.upsert({
    where: { whatsappId },
    update: {},
    create: {
      whatsappId,
      // The phone is marked too. It is the field revealed to a driver on a
      // confirmed match, so an unmarked one is a number someone might dial.
      phone: opts.phone === undefined ? syntheticId("phone", opts.ref) : opts.phone,
      name: opts.name ?? `ТЕСТ пассажир ${opts.ref}`,
      preferredLang: opts.preferredLang ?? "RU",
    },
  });
}

export interface SyntheticDriverOptions {
  ref: string | number;
  name?: string;
  phone?: string | null;
  carModel?: string;
  carPlate?: string;
  preferredLang?: Language;
  /** Defaults to ACTIVE: a driver stuck in PENDING_VERIFICATION cannot be
   * matched, and a fixture that silently produces unmatchable drivers would
   * make an E2E scenario fail for a reason that has nothing to do with what it
   * is testing. Pass PENDING_VERIFICATION explicitly to test that path. */
  status?: DriverStatus;
}

/** Creates (or reuses) a synthetic driver and their vehicle. */
export async function createSyntheticDriver(opts: SyntheticDriverOptions) {
  assertSyntheticContour();

  const telegramUserId = syntheticId("tg", opts.ref);
  const status = opts.status ?? "ACTIVE";
  return db.driver.upsert({
    where: { telegramUserId },
    update: {},
    create: {
      telegramUserId,
      telegramUsername: syntheticId("tguser", opts.ref),
      phone: opts.phone === undefined ? syntheticId("phone", opts.ref) : opts.phone,
      name: opts.name ?? `ТЕСТ водитель ${opts.ref}`,
      carModel: opts.carModel ?? "SYNTHETIC TEST Vehicle",
      // Marked, because a plate is what a dispatcher reads off the screen and
      // acts on. A plausible-looking plate on a test row is a real car.
      carPlate: opts.carPlate ?? syntheticId("plate", opts.ref),
      preferredLang: opts.preferredLang ?? "RU",
      status,
      // verifiedByAdminId stays null. A synthetic driver may be ACTIVE, but
      // claiming a named admin verified them would be a fabricated human act
      // in the audit trail (s.10, s.41).
      verifiedAt: status === "ACTIVE" ? new Date() : null,
    },
  });
}

/** What cleanup removed, table by table. Returned rather than logged so a
 * scenario batch can assert on it: "the run left nothing behind" is a claim
 * that needs evidence, not a comment. */
export interface CleanupReport {
  deleted: Record<string, number>;
  total: number;
}

const MARKED = { contains: SYNTHETIC_MARKER };

// Ordered child-first. Postgres enforces the foreign keys, so a table missing
// from this list does not silently leak — the delete of its parent fails loudly
// and the integration test for this module catches it.
const CLEANUP_STEPS: Array<{ table: string; run: () => Promise<{ count: number }> }> = [
  {
    table: "PassengerLoopOffer",
    run: () =>
      db.passengerLoopOffer.deleteMany({
        where: { loopRun: { tripRequest: { passenger: { whatsappId: MARKED } } } },
      }),
  },
  {
    table: "PassengerLoopRun",
    run: () => db.passengerLoopRun.deleteMany({ where: { tripRequest: { passenger: { whatsappId: MARKED } } } }),
  },
  {
    table: "LedgerEntry",
    run: () => db.ledgerEntry.deleteMany({ where: { driver: { telegramUserId: MARKED } } }),
  },
  {
    table: "RtBalance",
    run: () => db.rtBalance.deleteMany({ where: { driver: { telegramUserId: MARKED } } }),
  },
  {
    table: "DriveCrmEvent",
    run: () => db.driveCrmEvent.deleteMany({ where: { driver: { telegramUserId: MARKED } } }),
  },
  {
    table: "Parcel",
    run: () =>
      db.parcel.deleteMany({
        where: {
          OR: [
            { driver: { telegramUserId: MARKED } },
            { origin: { corridor: { key: SYNTHETIC_CORRIDOR_KEY } } },
            { destination: { corridor: { key: SYNTHETIC_CORRIDOR_KEY } } },
          ],
        },
      }),
  },
  {
    table: "Trip",
    run: () =>
      db.trip.deleteMany({
        where: { OR: [{ driver: { telegramUserId: MARKED } }, { passenger: { whatsappId: MARKED } }] },
      }),
  },
  {
    table: "Match",
    run: () =>
      db.match.deleteMany({
        where: {
          OR: [
            { tripRequest: { passenger: { whatsappId: MARKED } } },
            { driverOffer: { driver: { telegramUserId: MARKED } } },
          ],
        },
      }),
  },
  {
    table: "TripRequest",
    run: () => db.tripRequest.deleteMany({ where: { passenger: { whatsappId: MARKED } } }),
  },
  {
    table: "DriverOffer",
    run: () => db.driverOffer.deleteMany({ where: { driver: { telegramUserId: MARKED } } }),
  },
  {
    table: "ScoutCandidate",
    run: () => db.scoutCandidate.deleteMany({ where: { linkedDriver: { telegramUserId: MARKED } } }),
  },
  {
    table: "MiraMessage",
    run: () => db.miraMessage.deleteMany({ where: { conversation: { externalUserId: MARKED } } }),
  },
  {
    table: "MiraConversation",
    run: () => db.miraConversation.deleteMany({ where: { externalUserId: MARKED } }),
  },
  {
    table: "PassengerFinancialIntent",
    run: () =>
      db.passengerFinancialIntent.deleteMany({
        where: { OR: [{ conversationId: MARKED }, { customerRef: MARKED }, { idempotencyKey: MARKED }] },
      }),
  },
  {
    table: "AcquisitionOutreachEvent",
    run: () =>
      db.acquisitionOutreachEvent.deleteMany({
        where: { OR: [{ prospectRef: MARKED }, { idempotencyKey: MARKED }] },
      }),
  },
  {
    table: "RawMessage",
    run: () => db.rawMessage.deleteMany({ where: { OR: [{ senderId: MARKED }, { chatId: MARKED }] } }),
  },
  {
    // Kept last among the log tables and matched on entityId/traceId rather
    // than on a relation: the audit log deliberately has no foreign keys, so
    // nothing else will ever delete these rows for us.
    table: "AuditLogEntry",
    run: () =>
      db.auditLogEntry.deleteMany({
        where: { OR: [{ entityId: MARKED }, { actorId: MARKED }, { traceId: MARKED }] },
      }),
  },
  {
    table: "Driver",
    run: () => db.driver.deleteMany({ where: { telegramUserId: MARKED } }),
  },
  {
    table: "Passenger",
    run: () => db.passenger.deleteMany({ where: { whatsappId: MARKED } }),
  },
  {
    table: "Partner",
    run: () => db.partner.deleteMany({ where: { stop: { corridor: { key: SYNTHETIC_CORRIDOR_KEY } } } }),
  },
  {
    table: "Stop",
    run: () => db.stop.deleteMany({ where: { corridor: { key: SYNTHETIC_CORRIDOR_KEY } } }),
  },
  {
    table: "Corridor",
    run: () => db.corridor.deleteMany({ where: { key: SYNTHETIC_CORRIDOR_KEY } }),
  },
];

/** Removes every synthetic row, in foreign-key-safe order, and reports the
 * counts.
 *
 * Scoped by marker rather than by "everything in this database": the local
 * contour also holds the seeded real corridor, and a cleanup that truncated it
 * would quietly change what the next scenario was running against. */
export async function cleanupSyntheticData(): Promise<CleanupReport> {
  assertSyntheticContour();

  const deleted: Record<string, number> = {};
  let total = 0;
  for (const step of CLEANUP_STEPS) {
    const { count } = await step.run();
    deleted[step.table] = count;
    total += count;
  }
  return { deleted, total };
}

/** Counts what is still marked synthetic. Exists so the check for "did the run
 * leave anything behind" reads the database instead of trusting the report
 * cleanup just produced about itself. */
export async function countSyntheticEntities(): Promise<{ passengers: number; drivers: number; corridors: number }> {
  const [passengers, drivers, corridors] = await Promise.all([
    db.passenger.count({ where: { whatsappId: MARKED } }),
    db.driver.count({ where: { telegramUserId: MARKED } }),
    db.corridor.count({ where: { key: SYNTHETIC_CORRIDOR_KEY } }),
  ]);
  return { passengers, drivers, corridors };
}
