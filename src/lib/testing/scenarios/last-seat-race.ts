// Several passengers, one seat.
//
// This is the case a catalogue of single-passenger journeys structurally
// cannot express, and RT defends against it twice over:
//
//   1. Sequentially, by refusing to propose an offer that is already
//      mid-negotiation with somebody else (orchestrate.ts, spec s.5). This is
//      the ordinary path and it is deterministic.
//   2. Concurrently, by the conditional seat decrement and the Match unwind
//      that follow, for when two demands are proposed at the same instant and
//      neither saw the other's Match yet. This is the path that only exists
//      under real concurrency, so it cannot be summoned on demand — the runner
//      creates the conditions and reports whether the seat was actually
//      contested.
//
// Like the passenger journey, this drives RT rather than modelling it. It
// ingests real messages, calls the real response handlers, and then reads the
// tables. It never writes a Match, never decides who won, and never forces the
// race by reaching past an entrypoint — a race manufactured that way would
// prove something about the runner instead of about RT.
import { db } from "@/lib/db";
import { ingestDriverPrivateMessage, ingestPassengerMessage } from "@/lib/ingest";
import { handleDriverResponse, handlePassengerResponse } from "@/lib/matching/orchestrate";
import { scenarioWithSink, type OutboundRecord } from "../outbound-sink";
import { runInScenario } from "../scenario-context";
import { assertSyntheticContour, syntheticId } from "../synthetic";
import {
  createSyntheticDriver,
  createSyntheticPassenger,
  ensureSyntheticGeography,
  SYNTHETIC_STOP_NAMES_RU,
} from "../synthetic-fixtures";

export interface LastSeatRaceSpec {
  ref: string | number;
  /** Travel date in days from today. As everywhere else in the rig, a distinct
   * date is what keeps this race away from every other scenario's supply. */
  daysAhead: number;
  /** How many passengers go for the seat. Two is the interesting case; more
   * makes an accidental miss less likely. */
  contenders?: number;
  /** Seats in the car. Left at 1 so there can be exactly one winner. */
  seatsOffered?: number;
  /** Whether the demands arrive together or one after the other. Together is
   * the race; one after the other is the sequential guard. */
  arrival?: "CONCURRENT" | "SEQUENTIAL";
}

export interface LastSeatRaceResult {
  driverId: string;
  driverOfferId: string | null;
  tripRequestIds: string[];
  /** Matches RT proposed at all. More than one against a single offer is the
   * contested case; exactly one means the sequential guard held first. */
  proposedMatchIds: string[];
  /** Matches that reached AWAITING_PASSENGER — everyone still in it when the
   * confirmations went out together. */
  racedMatchIds: string[];
  confirmedMatchIds: string[];
  tripIds: string[];
  seatsTotal: number;
  seatsAvailable: number;
  /** True when more than one confirmation was genuinely in flight for the same
   * seat. Reported, never asserted by the runner: whether the race happens is
   * up to the scheduler. */
  contested: boolean;
  /** Errors thrown out of the concurrent calls. Collected rather than raised:
   * "the loser's confirmation threw" is a finding about RT, and the caller has
   * to see it next to the seat count. */
  errors: string[];
  outbound: readonly OutboundRecord[];
}

const ORIGIN = SYNTHETIC_STOP_NAMES_RU[0];
const DESTINATION = SYNTHETIC_STOP_NAMES_RU[2];

function formatDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export async function runLastSeatRace(spec: LastSeatRaceSpec): Promise<LastSeatRaceResult> {
  assertSyntheticContour();

  const ref = String(spec.ref);
  const { context, sink } = scenarioWithSink({
    testRunId: `race-${ref}`,
    scenarioId: `last-seat-race:${ref}`,
  });

  return runInScenario(context, () => execute(spec, ref, sink.all.bind(sink)));
}

async function execute(
  spec: LastSeatRaceSpec,
  ref: string,
  outbound: () => readonly OutboundRecord[],
): Promise<LastSeatRaceResult> {
  const contenders = spec.contenders ?? 2;
  const seatsOffered = spec.seatsOffered ?? 1;
  const arrival = spec.arrival ?? "CONCURRENT";
  const date = formatDate(spec.daysAhead);
  const errors: string[] = [];

  await ensureSyntheticGeography();

  // --- One car, one seat ---------------------------------------------------
  const driver = await createSyntheticDriver({ ref: `${ref}-driver`, status: "ACTIVE" });
  const offer = await ingestDriverPrivateMessage(
    driver.telegramUserId,
    driver.telegramUsername,
    `Еду ${ORIGIN} - ${DESTINATION}, ${date}, ${seatsOffered} мест свободно`,
    syntheticId("inbound-offer", `${ref}-driver`),
  );

  // --- The contenders ------------------------------------------------------
  // Created up front, because creating a synthetic passenger is fixture work
  // and only the inbound messages should be racing.
  type Contender = { passengerRef: string; passenger: Awaited<ReturnType<typeof createSyntheticPassenger>> };
  const passengers: Contender[] = [];
  for (let i = 0; i < contenders; i++) {
    const passengerRef = `${ref}-p${i}`;
    passengers.push({ passengerRef, passenger: await createSyntheticPassenger({ ref: passengerRef }) });
  }

  const askFor = async ({ passengerRef, passenger }: Contender) =>
    ingestPassengerMessage(
      passenger.whatsappId,
      `Ищу машину ${ORIGIN} - ${DESTINATION}, ${date}, 1 мест`,
      syntheticId("inbound-request", passengerRef),
    );

  const tripRequestIds: string[] = [];
  if (arrival === "CONCURRENT") {
    // Two webhooks landing at once. Both calls run the real matching path, and
    // each may or may not see the other's Match — which is the point.
    const settled = await Promise.allSettled(passengers.map(askFor));
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        if (outcome.value) tripRequestIds.push(outcome.value.id);
      } else {
        errors.push(`ingest: ${describe(outcome.reason)}`);
      }
    }
  } else {
    for (const contender of passengers) {
      const request = await askFor(contender);
      if (request) tripRequestIds.push(request.id);
    }
  }

  const proposed = await db.match.findMany({
    where: { tripRequestId: { in: tripRequestIds } },
    select: { id: true },
  });

  // --- The driver says yes to everyone who reached them --------------------
  // Real and ordinary: a driver accepting a second enquiry has no way to know
  // the first passenger is about to confirm. RT is what has to notice.
  const awaitingDriver = await db.match.findMany({
    where: { tripRequestId: { in: tripRequestIds }, status: "AWAITING_DRIVER" },
    select: { id: true },
  });
  await Promise.all(
    awaitingDriver.map(async (match) => {
      try {
        await handleDriverResponse(match.id, true);
      } catch (err) {
        errors.push(`driver response ${match.id}: ${describe(err)}`);
      }
    }),
  );

  const raced = await db.match.findMany({
    where: { tripRequestId: { in: tripRequestIds }, status: "AWAITING_PASSENGER" },
    select: { id: true },
  });

  // --- Everybody confirms at once ------------------------------------------
  await Promise.all(
    raced.map(async (match) => {
      try {
        await handlePassengerResponse(match.id, true);
      } catch (err) {
        errors.push(`passenger response ${match.id}: ${describe(err)}`);
      }
    }),
  );

  const [confirmed, trips, finalOffer] = await Promise.all([
    db.match.findMany({ where: { tripRequestId: { in: tripRequestIds }, status: "CONFIRMED" }, select: { id: true } }),
    db.trip.findMany({ where: { match: { tripRequestId: { in: tripRequestIds } } }, select: { id: true } }),
    offer ? db.driverOffer.findUniqueOrThrow({ where: { id: offer.id } }) : null,
  ]);

  return {
    driverId: driver.id,
    driverOfferId: offer?.id ?? null,
    tripRequestIds,
    proposedMatchIds: proposed.map((m) => m.id),
    racedMatchIds: raced.map((m) => m.id),
    confirmedMatchIds: confirmed.map((m) => m.id),
    tripIds: trips.map((t) => t.id),
    seatsTotal: finalOffer?.seatsTotal ?? 0,
    seatsAvailable: finalOffer?.seatsAvailable ?? 0,
    contested: raced.length > 1,
    errors,
    outbound: outbound(),
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
