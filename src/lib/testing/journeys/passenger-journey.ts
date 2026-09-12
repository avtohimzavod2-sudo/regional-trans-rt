// One passenger's whole journey, executed against the real system.
//
// This is a DRIVER of RT, not a model of it. Every state change below happens
// because a real entrypoint — the same function a webhook or a dispatcher
// click calls — was invoked and did its own work: extraction, TripRequest
// creation, the RT OFFICE loop, MATCH's candidate search, the seat-decrement
// CAS, Trip creation, commission. Nothing here writes a Match, a Trip or a
// seat count of its own. If a step below produced the right answer, the system
// produced it.
//
// The ownership boundaries the Founder set are the reason this file is shaped
// the way it is:
//
//   - Мира is the public contact. The journey never invents a reply text; it
//     reads what the real send boundary was handed.
//   - Жолчу answers route/geo questions. The journey never supplies an ETA or
//     a resolved pickup point.
//   - RT OFFICE owns the demand loop. The journey never sets a loop status —
//     it reads the one the engine transitioned to.
//   - CRM Авто owns Drive CRM. The one operational fact this journey records
//     (the driver's own departure report) goes through recordOperationalEvent,
//     never a direct DriveCrmEvent write.
//   - Акжол only reads. Nothing here calls into Акжол at all.
//
// Safety: the whole journey runs inside runInScenario() with a dry-run sink,
// and every participant is SYNTHETIC. Those two facts together mean no message
// can reach a person even if a mode env var is misconfigured — the scenario
// gateway refuses a real recipient regardless, and there is no real recipient
// in the run to begin with.
import type { DriverStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { rootContext } from "@/lib/agents/trace";
import { recordOperationalEvent } from "@/lib/crm-auto/orchestrator";
import { ingestDriverPrivateMessage, ingestPassengerMessage } from "@/lib/ingest";
import { CANCEL_REASON } from "@/lib/matching/booking-state";
import {
  cancelPendingDemand,
  cancelTrip,
  completeTrip,
  handleDriverResponse,
  handlePassengerResponse,
  markTripDeparted,
} from "@/lib/matching/orchestrate";
import {
  buildSignificantExcessBaggageFinancialIntent,
  recordPassengerFinancialIntent,
} from "@/lib/mira/passenger-finance";
import { getLoopRunByTripRequestId } from "@/lib/rt-office/passenger-loop";
import { scenarioWithSink, type OutboundRecord } from "../outbound-sink";
import { runInScenario } from "../scenario-context";
import { assertSyntheticContour, syntheticId } from "../synthetic";
import {
  createSyntheticDriver,
  createSyntheticPassenger,
  ensureSyntheticGeography,
  SYNTHETIC_STOP_NAMES_RU,
} from "../synthetic-fixtures";

/** What the driver did with the offer RT sent them. NO_RESPONSE is a real
 * outcome, not an omission: it is the state the expiry sweep later acts on. */
export type DriverReply = "ACCEPT" | "DECLINE" | "NO_RESPONSE";
export type PassengerReply = "ACCEPT" | "DECLINE" | "NO_RESPONSE";

export type SupplySituation =
  /** A verified driver has already posted a matching offer. */
  | "OFFER_POSTED"
  /** Nobody is driving that route that day. */
  | "NONE"
  /** A driver posted, but has not been verified — not usable supply. */
  | "DRIVER_UNVERIFIED";

export type AfterConfirmation =
  | "COMPLETE"
  | "CANCEL_BY_PASSENGER"
  | "CANCEL_BY_DRIVER"
  | "LEAVE_SCHEDULED";

export interface PassengerJourneySpec {
  /** Distinguishes this journey's synthetic entities from every other run's. */
  ref: string | number;
  seats?: number;
  offerSeats?: number;
  /** Travel date, in days from today. Written into both messages as an
   * explicit dd.mm.yyyy so the two sides cannot drift apart at midnight. */
  daysAhead?: number;
  supply?: SupplySituation;
  /** Overrides the generated passenger message. Used for the cases where the
   * point is that RT could not read it. */
  passengerMessage?: string;
  driverReply?: DriverReply;
  passengerReply?: PassengerReply;
  afterConfirmation?: AfterConfirmation;
  /** Redeliver the identical inbound message, as a flaky webhook would. */
  duplicateInbound?: boolean;
  /** Records Mira's excess-baggage financial intent for the confirmed trip.
   * An intent, not a payment: no money moves anywhere in this contour. */
  excessBaggageFeeSom?: number;
  /** Fare the driver collected in person. Only affects RT's own commission
   * bookkeeping on completion. */
  fareSom?: number;
  /** Passenger withdraws demand that never reached a confirmed trip. */
  cancelDemandAtEnd?: boolean;
}

export type JourneyOutcome =
  | "DEMAND_NOT_UNDERSTOOD"
  | "NO_SUPPLY"
  | "DRIVER_DECLINED"
  | "AWAITING_DRIVER"
  | "PASSENGER_DECLINED"
  | "AWAITING_PASSENGER"
  | "DEMAND_CANCELLED"
  | "TRIP_SCHEDULED"
  | "TRIP_CANCELLED"
  | "TRIP_COMPLETED";

export interface JourneyStep {
  at: Date;
  /** Who acted. "RT" covers everything the system did on its own. */
  actor: "PASSENGER" | "DRIVER" | "RT";
  step: string;
  detail?: Record<string, unknown>;
}

export interface PassengerJourneyResult {
  ref: string;
  scenarioId: string;
  outcome: JourneyOutcome;
  passengerId: string;
  driverId: string | null;
  tripRequestId: string | null;
  driverOfferId: string | null;
  matchId: string | null;
  tripId: string | null;
  loopRunId: string | null;
  /** The correlation id RT OFFICE assigned this demand. The handle Phase 6's
   * timeline reader uses; recorded here so a failing scenario can be traced
   * without first guessing which run it was. */
  correlationId: string | null;
  loopStatus: string | null;
  matchStatus: string | null;
  tripStatus: string | null;
  /** Every message the dry-run provider accepted, in order. */
  outbound: readonly OutboundRecord[];
  /** The runner's own narration of what it invoked. Useful when a scenario
   * fails, but never evidence of what the system recorded — that lives in the
   * database and the audit log. */
  steps: JourneyStep[];
}

function formatDate(daysAhead: number): { text: string } {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return { text: `${dd}.${mm}.${d.getFullYear()}` };
}

const ORIGIN = SYNTHETIC_STOP_NAMES_RU[0];
const DESTINATION = SYNTHETIC_STOP_NAMES_RU[2];

function passengerRequestText(seats: number, date: string): string {
  return `Ищу машину ${ORIGIN} - ${DESTINATION}, ${date}, ${seats} мест`;
}

function driverOfferText(seats: number, date: string): string {
  return `Еду ${ORIGIN} - ${DESTINATION}, ${date}, ${seats} мест свободно`;
}

/**
 * Runs one passenger journey end to end and reports where it ended up.
 *
 * Never throws for a business outcome — "no driver was available" is an
 * answer, not a failure. It does throw if the contour is wrong, which is the
 * one thing a caller must not be allowed to continue past.
 */
export async function runPassengerJourney(spec: PassengerJourneySpec): Promise<PassengerJourneyResult> {
  assertSyntheticContour();

  const ref = String(spec.ref);
  const scenarioId = `passenger-journey:${ref}`;
  const { context, sink } = scenarioWithSink({ testRunId: `journey-${ref}`, scenarioId });

  return runInScenario(context, () => execute(spec, ref, scenarioId, sink.all.bind(sink)));
}

async function execute(
  spec: PassengerJourneySpec,
  ref: string,
  scenarioId: string,
  outbound: () => readonly OutboundRecord[],
): Promise<PassengerJourneyResult> {
  const seats = spec.seats ?? 2;
  const offerSeats = spec.offerSeats ?? 4;
  const supply = spec.supply ?? "OFFER_POSTED";
  const { text: date } = formatDate(spec.daysAhead ?? 1);

  const steps: JourneyStep[] = [];
  const step = (actor: JourneyStep["actor"], name: string, detail?: Record<string, unknown>) => {
    steps.push({ at: new Date(), actor, step: name, detail });
  };

  await ensureSyntheticGeography();
  const passenger = await createSyntheticPassenger({ ref });
  step("RT", "synthetic_passenger_ready", { passengerId: passenger.id });

  // --- Supply, posted before the demand exists, as it is in real life -------
  let driverId: string | null = null;
  let driverOfferId: string | null = null;
  if (supply !== "NONE") {
    const status: DriverStatus = supply === "DRIVER_UNVERIFIED" ? "PENDING_VERIFICATION" : "ACTIVE";
    const driver = await createSyntheticDriver({ ref, status });
    driverId = driver.id;
    step("DRIVER", "driver_ready", { driverId: driver.id, status });

    const offer = await ingestDriverPrivateMessage(
      driver.telegramUserId,
      driver.telegramUsername,
      driverOfferText(offerSeats, date),
      syntheticId("inbound-offer", ref),
    );
    driverOfferId = offer?.id ?? null;
    step("DRIVER", offer ? "offer_posted" : "offer_not_understood", { driverOfferId });
  }

  // --- Demand -------------------------------------------------------------
  const inboundId = syntheticId("inbound-request", ref);
  const request = await ingestPassengerMessage(
    passenger.whatsappId,
    spec.passengerMessage ?? passengerRequestText(seats, date),
    inboundId,
  );
  step("PASSENGER", request ? "demand_created" : "demand_not_understood", { tripRequestId: request?.id });

  if (spec.duplicateInbound) {
    // The identical webhook, delivered twice. The assertion is not made here —
    // it is made by whatever counts TripRequests afterwards.
    await ingestPassengerMessage(
      passenger.whatsappId,
      spec.passengerMessage ?? passengerRequestText(seats, date),
      inboundId,
    );
    step("PASSENGER", "duplicate_inbound_redelivered", { rawMessageId: inboundId });
  }

  const base = {
    ref,
    scenarioId,
    passengerId: passenger.id,
    driverId,
    driverOfferId,
    steps,
  };

  if (!request) {
    return {
      ...base,
      outcome: "DEMAND_NOT_UNDERSTOOD",
      tripRequestId: null,
      matchId: null,
      tripId: null,
      loopRunId: null,
      correlationId: null,
      loopStatus: null,
      matchStatus: null,
      tripStatus: null,
      outbound: outbound(),
    };
  }

  const loopRun = await getLoopRunByTripRequestId(request.id);
  const withRequest = {
    ...base,
    tripRequestId: request.id,
    loopRunId: loopRun?.id ?? null,
    correlationId: loopRun?.correlationId ?? null,
  };

  // MATCH already ran inside ingest. Read what it decided rather than asking
  // it again — a second proposal call here would be this file doing matching.
  const proposed = await db.match.findFirst({
    where: { tripRequestId: request.id, status: { in: ["AWAITING_DRIVER", "AWAITING_PASSENGER"] } },
    orderBy: { createdAt: "desc" },
  });

  if (!proposed) {
    step("RT", "no_supply_for_demand");
    const cancelled = spec.cancelDemandAtEnd ? await withdrawDemand(request.id, step) : false;
    return {
      ...withRequest,
      outcome: cancelled ? "DEMAND_CANCELLED" : "NO_SUPPLY",
      matchId: null,
      tripId: null,
      ...(await readStatuses(request.id, null, null)),
      outbound: outbound(),
    };
  }

  const matchId = proposed.id;
  step("RT", "offer_proposed_to_driver", { matchId });

  // --- Driver's answer -----------------------------------------------------
  const driverReply = spec.driverReply ?? "ACCEPT";
  if (driverReply === "NO_RESPONSE") {
    step("DRIVER", "no_response");
    const cancelled = spec.cancelDemandAtEnd ? await withdrawDemand(request.id, step) : false;
    return {
      ...withRequest,
      outcome: cancelled ? "DEMAND_CANCELLED" : "AWAITING_DRIVER",
      matchId,
      tripId: null,
      ...(await readStatuses(request.id, matchId, null)),
      outbound: outbound(),
    };
  }

  await handleDriverResponse(matchId, driverReply === "ACCEPT");
  step("DRIVER", driverReply === "ACCEPT" ? "driver_accepted" : "driver_declined", { matchId });

  if (driverReply === "DECLINE") {
    // The engine may have re-proposed to somebody else. Report what is
    // actually open now rather than assuming the decline ended the story.
    const next = await db.match.findFirst({
      where: { tripRequestId: request.id, status: { in: ["AWAITING_DRIVER", "AWAITING_PASSENGER"] } },
      orderBy: { createdAt: "desc" },
    });
    if (next) step("RT", "rematched_after_driver_decline", { matchId: next.id });
    const cancelled = spec.cancelDemandAtEnd ? await withdrawDemand(request.id, step) : false;
    return {
      ...withRequest,
      outcome: cancelled ? "DEMAND_CANCELLED" : "DRIVER_DECLINED",
      matchId,
      tripId: null,
      ...(await readStatuses(request.id, matchId, null)),
      outbound: outbound(),
    };
  }

  // --- Passenger's answer --------------------------------------------------
  const passengerReply = spec.passengerReply ?? "ACCEPT";
  if (passengerReply === "NO_RESPONSE") {
    step("PASSENGER", "no_response");
    const cancelled = spec.cancelDemandAtEnd ? await withdrawDemand(request.id, step) : false;
    return {
      ...withRequest,
      outcome: cancelled ? "DEMAND_CANCELLED" : "AWAITING_PASSENGER",
      matchId,
      tripId: null,
      ...(await readStatuses(request.id, matchId, null)),
      outbound: outbound(),
    };
  }

  await handlePassengerResponse(matchId, passengerReply === "ACCEPT");
  step("PASSENGER", passengerReply === "ACCEPT" ? "passenger_accepted" : "passenger_declined", { matchId });

  if (passengerReply === "DECLINE") {
    const cancelled = spec.cancelDemandAtEnd ? await withdrawDemand(request.id, step) : false;
    return {
      ...withRequest,
      outcome: cancelled ? "DEMAND_CANCELLED" : "PASSENGER_DECLINED",
      matchId,
      tripId: null,
      ...(await readStatuses(request.id, matchId, null)),
      outbound: outbound(),
    };
  }

  const trip = await db.trip.findFirst({ where: { matchId } });
  if (!trip) {
    // The seat race: the match was confirmed and then unwound because the
    // seats had gone. Not a defect, and not a trip either.
    step("RT", "confirmation_did_not_produce_a_trip", { matchId });
    return {
      ...withRequest,
      outcome: "PASSENGER_DECLINED",
      matchId,
      tripId: null,
      ...(await readStatuses(request.id, matchId, null)),
      outbound: outbound(),
    };
  }
  step("RT", "trip_created", { tripId: trip.id });

  // --- Mira's financial intent, if the baggage conversation happened -------
  if (spec.excessBaggageFeeSom) {
    const intent = buildSignificantExcessBaggageFinancialIntent({
      conversationId: syntheticId("conversation", ref),
      customerRef: passenger.whatsappId,
      amountSom: spec.excessBaggageFeeSom,
      tripId: trip.id,
      eventKey: syntheticId("baggage", ref),
    });
    const recorded = await recordPassengerFinancialIntent(rootContext(), intent);
    step("RT", "passenger_financial_intent_recorded", {
      amountSom: spec.excessBaggageFeeSom,
      created: recorded.created,
    });
  }

  // --- The trip itself -----------------------------------------------------
  const after = spec.afterConfirmation ?? "COMPLETE";
  if (after === "LEAVE_SCHEDULED") {
    return {
      ...withRequest,
      outcome: "TRIP_SCHEDULED",
      matchId,
      tripId: trip.id,
      ...(await readStatuses(request.id, matchId, trip.id)),
      outbound: outbound(),
    };
  }

  if (after === "CANCEL_BY_PASSENGER" || after === "CANCEL_BY_DRIVER") {
    const byPassenger = after === "CANCEL_BY_PASSENGER";
    await cancelTrip(
      trip.id,
      byPassenger ? "PASSENGER" : "DRIVER",
      byPassenger ? CANCEL_REASON.PASSENGER_CANCELLED : CANCEL_REASON.DRIVER_CANCELLED,
    );
    step(byPassenger ? "PASSENGER" : "DRIVER", "trip_cancelled", { tripId: trip.id });
    return {
      ...withRequest,
      outcome: "TRIP_CANCELLED",
      matchId,
      tripId: trip.id,
      ...(await readStatuses(request.id, matchId, trip.id)),
      outbound: outbound(),
    };
  }

  await markTripDeparted(trip.id);
  step("DRIVER", "departed", { tripId: trip.id });

  // The one Drive CRM fact this journey records, and it is the driver's own
  // report — not an ETA, which would have to come from Жолчу.
  await recordOperationalEvent({
    driverId: trip.driverId,
    tripId: trip.id,
    offerId: trip.driverOfferId,
    eventType: "OPERATIONAL_HISTORY",
    source: "DRIVER_REPORT",
    details: { reported: "departed" },
    idempotencyKey: syntheticId("crm-departed", ref),
  });
  step("RT", "drive_crm_event_recorded", { tripId: trip.id });

  await completeTrip(trip.id, spec.fareSom ? { totalFareSom: spec.fareSom } : undefined);
  step("DRIVER", "trip_completed", { tripId: trip.id });

  return {
    ...withRequest,
    outcome: "TRIP_COMPLETED",
    matchId,
    tripId: trip.id,
    ...(await readStatuses(request.id, matchId, trip.id)),
    outbound: outbound(),
  };
}

async function withdrawDemand(
  tripRequestId: string,
  step: (actor: JourneyStep["actor"], name: string, detail?: Record<string, unknown>) => void,
): Promise<boolean> {
  await cancelPendingDemand(tripRequestId);
  step("PASSENGER", "demand_withdrawn", { tripRequestId });
  return true;
}

/** Reads the final statuses back out of the database. Deliberately re-read
 * rather than accumulated as the journey goes: the value of an end-state
 * assertion is that it comes from the tables, not from this file's memory of
 * what it thinks it did. */
async function readStatuses(
  tripRequestId: string,
  matchId: string | null,
  tripId: string | null,
): Promise<{ loopStatus: string | null; matchStatus: string | null; tripStatus: string | null }> {
  const [loopRun, match, trip] = await Promise.all([
    getLoopRunByTripRequestId(tripRequestId),
    matchId ? db.match.findUnique({ where: { id: matchId }, select: { status: true } }) : null,
    tripId ? db.trip.findUnique({ where: { id: tripId }, select: { status: true } }) : null,
  ]);
  return {
    loopStatus: loopRun?.status ?? null,
    matchStatus: match?.status ?? null,
    tripStatus: trip?.status ?? null,
  };
}
