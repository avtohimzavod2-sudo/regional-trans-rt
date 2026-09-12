// The scenarios RT has to survive, and what surviving each one means.
//
// A scenario is not "run the journey and see what happens" — every entry below
// declares the outcome RT is required to reach and, where the outcome alone is
// not enough, a verification that reads the database afterwards. A batch that
// reports 300 passes is otherwise only a report that 300 things finished.
//
// The list is deliberately weighted towards the ways an order does not become a
// trip. A dispatch business fails on refusals, silence, duplicates and empty
// supply far more often than it fails on the happy path, and those are the
// paths where a mocked unit test is least likely to have told the truth.
//
// Multi-actor races (two passengers for the last seat) are not here: they need
// two journeys interleaved, which is not a single PassengerJourneySpec. They
// live in the engine's own integration test instead.
import { db } from "@/lib/db";
import type { JourneyOutcome, PassengerJourneyResult, PassengerJourneySpec } from "../journeys/passenger-journey";

export type ScenarioCategory = "PASSENGER" | "DRIVER" | "FINANCE" | "INFRA";

/** Everything the engine fixes for a scenario so that scenarios in one batch
 * cannot interfere with each other. `daysAhead` is the isolation: matching is
 * keyed on an exact travel date, so a distinct date per scenario means one
 * scenario's passenger can never be handed another's driver. */
export interface ScenarioSlot {
  ref: string;
  daysAhead: number;
}

export interface ScenarioDefinition {
  key: string;
  category: ScenarioCategory;
  /** One sentence, in the report, so a failure is readable without this file. */
  intent: string;
  spec: (slot: ScenarioSlot) => PassengerJourneySpec;
  expect: JourneyOutcome;
  /** Returns a failure reason, or null when the scenario's own extra promises
   * hold. Runs after the journey, against the real tables. */
  verify?: (result: PassengerJourneyResult) => Promise<string | null>;
}

async function countTripsForRequest(tripRequestId: string | null): Promise<number> {
  if (!tripRequestId) return 0;
  return db.trip.count({ where: { match: { tripRequestId } } });
}

export const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    key: "ordinary-trip",
    category: "PASSENGER",
    intent: "A passenger asks, a driver agrees, the trip runs and closes.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, seats: 2, fareSom: 1200 }),
    expect: "TRIP_COMPLETED",
    verify: async (r) => {
      const trip = await db.trip.findUniqueOrThrow({ where: { id: r.tripId! } });
      if (!trip.completedAt) return "trip completed without a completedAt";
      if (r.loopStatus !== "PASSENGER_ACCEPTED") return `loop ended at ${r.loopStatus}, not PASSENGER_ACCEPTED`;
      return null;
    },
  },
  {
    key: "seats-taken-from-offer",
    category: "PASSENGER",
    intent: "Confirming takes exactly the requested seats out of the offer.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, seats: 3, offerSeats: 4 }),
    expect: "TRIP_COMPLETED",
    verify: async (r) => {
      const offer = await db.driverOffer.findUniqueOrThrow({ where: { id: r.driverOfferId! } });
      if (offer.seatsAvailable !== 1) return `offer has ${offer.seatsAvailable} seats left, expected 1`;
      if (offer.status !== "PARTIALLY_FILLED") return `offer is ${offer.status}, expected PARTIALLY_FILLED`;
      return null;
    },
  },
  {
    key: "last-seats-taken",
    category: "PASSENGER",
    intent: "A passenger who takes the whole car leaves nothing to sell.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, seats: 3, offerSeats: 3 }),
    expect: "TRIP_COMPLETED",
    verify: async (r) => {
      const offer = await db.driverOffer.findUniqueOrThrow({ where: { id: r.driverOfferId! } });
      if (offer.seatsAvailable !== 0) return `offer has ${offer.seatsAvailable} seats left, expected 0`;
      return null;
    },
  },
  {
    key: "no-supply",
    category: "PASSENGER",
    intent: "Nobody is driving that day, and RT says so instead of inventing a car.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, supply: "NONE" }),
    expect: "NO_SUPPLY",
    verify: async (r) => {
      const matches = await db.match.count({ where: { tripRequestId: r.tripRequestId! } });
      return matches === 0 ? null : `${matches} matches exist for a request with no supply`;
    },
  },
  {
    key: "unverified-driver-is-not-supply",
    category: "DRIVER",
    intent: "A driver RT has not verified is not supply, however willing.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, supply: "DRIVER_UNVERIFIED" }),
    expect: "NO_SUPPLY",
    verify: async (r) => {
      const matches = await db.match.count({ where: { tripRequestId: r.tripRequestId! } });
      return matches === 0 ? null : `an unverified driver was matched (${matches} matches)`;
    },
  },
  {
    key: "not-enough-seats",
    category: "PASSENGER",
    intent: "A car with two seats is not a candidate for a party of four.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, seats: 4, offerSeats: 2 }),
    expect: "NO_SUPPLY",
    verify: async (r) => {
      const matches = await db.match.count({ where: { tripRequestId: r.tripRequestId! } });
      return matches === 0 ? null : "a party of four was matched to a car with two seats";
    },
  },
  {
    key: "driver-refuses",
    category: "DRIVER",
    intent: "A refusal ends the offer, not the demand, and produces no trip.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, driverReply: "DECLINE" }),
    expect: "DRIVER_DECLINED",
    verify: async (r) => {
      if (r.matchStatus !== "DECLINED_BY_DRIVER") return `match is ${r.matchStatus}, expected DECLINED_BY_DRIVER`;
      const trips = await countTripsForRequest(r.tripRequestId);
      return trips === 0 ? null : `${trips} trips exist after a driver refusal`;
    },
  },
  {
    key: "driver-never-answers",
    category: "DRIVER",
    intent: "Silence leaves the match waiting for the expiry sweep, not resolved.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, driverReply: "NO_RESPONSE" }),
    expect: "AWAITING_DRIVER",
    verify: async (r) => (r.matchStatus === "AWAITING_DRIVER" ? null : `match is ${r.matchStatus}`),
  },
  {
    key: "passenger-refuses",
    category: "PASSENGER",
    intent: "A passenger refusal returns the seats and the demand to the pool.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, passengerReply: "DECLINE" }),
    expect: "PASSENGER_DECLINED",
    verify: async (r) => {
      const offer = await db.driverOffer.findUniqueOrThrow({ where: { id: r.driverOfferId! } });
      if (offer.seatsAvailable !== offer.seatsTotal) return "seats were consumed by a refused offer";
      const request = await db.tripRequest.findUniqueOrThrow({ where: { id: r.tripRequestId! } });
      return request.status === "PENDING" ? null : `request is ${request.status}, expected PENDING`;
    },
  },
  {
    key: "passenger-never-answers",
    category: "PASSENGER",
    intent: "An unanswered proposal stays unanswered rather than defaulting either way.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, passengerReply: "NO_RESPONSE" }),
    expect: "AWAITING_PASSENGER",
    verify: async (r) => {
      const trips = await countTripsForRequest(r.tripRequestId);
      return trips === 0 ? null : "a trip exists for a proposal the passenger never answered";
    },
  },
  {
    key: "passenger-withdraws-demand",
    category: "PASSENGER",
    intent: "Demand withdrawn before anyone committed is cancelled, not left open.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, driverReply: "NO_RESPONSE", cancelDemandAtEnd: true }),
    expect: "DEMAND_CANCELLED",
    verify: async (r) => {
      const request = await db.tripRequest.findUniqueOrThrow({ where: { id: r.tripRequestId! } });
      return request.status === "CANCELLED" ? null : `request is ${request.status}, expected CANCELLED`;
    },
  },
  {
    key: "passenger-cancels-trip",
    category: "PASSENGER",
    intent: "A cancelled trip records who cancelled it.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, afterConfirmation: "CANCEL_BY_PASSENGER" }),
    expect: "TRIP_CANCELLED",
    verify: async (r) => {
      const trip = await db.trip.findUniqueOrThrow({ where: { id: r.tripId! } });
      if (trip.status !== "CANCELLED") return `trip is ${trip.status}`;
      return trip.cancelReason?.includes("PASSENGER_CANCELLED") ? null : `cancelReason is ${trip.cancelReason}`;
    },
  },
  {
    key: "driver-cancels-trip",
    category: "DRIVER",
    intent: "A driver dropping out is recorded as the driver's cancellation.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, afterConfirmation: "CANCEL_BY_DRIVER" }),
    expect: "TRIP_CANCELLED",
    verify: async (r) => {
      const trip = await db.trip.findUniqueOrThrow({ where: { id: r.tripId! } });
      return trip.cancelReason?.includes("DRIVER_CANCELLED") ? null : `cancelReason is ${trip.cancelReason}`;
    },
  },
  {
    key: "trip-still-ahead",
    category: "PASSENGER",
    intent: "A confirmed trip that has not departed yet is SCHEDULED, not closed early.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, afterConfirmation: "LEAVE_SCHEDULED" }),
    expect: "TRIP_SCHEDULED",
    verify: async (r) => {
      const trip = await db.trip.findUniqueOrThrow({ where: { id: r.tripId! } });
      if (trip.completedAt) return "a trip that has not departed has a completedAt";
      return trip.status === "SCHEDULED" ? null : `trip is ${trip.status}, expected SCHEDULED`;
    },
  },
  {
    key: "message-rt-cannot-read",
    category: "PASSENGER",
    intent: "An unparseable message becomes a clarification, never a guessed route.",
    spec: ({ ref, daysAhead }) => ({
      ref,
      daysAhead,
      passengerMessage: "Здравствуйте, а сколько стоит?",
    }),
    expect: "DEMAND_NOT_UNDERSTOOD",
    verify: async (r) => (r.tripRequestId === null ? null : "a trip request was created from an unreadable message"),
  },
  {
    key: "webhook-delivered-twice",
    category: "INFRA",
    intent: "A redelivered inbound produces one order, not two.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, duplicateInbound: true }),
    expect: "TRIP_COMPLETED",
    verify: async (r) => {
      const requests = await db.tripRequest.count({ where: { passengerId: r.passengerId } });
      if (requests !== 1) return `${requests} trip requests from one message delivered twice`;
      const runs = await db.passengerLoopRun.count({ where: { tripRequest: { passengerId: r.passengerId } } });
      return runs === 1 ? null : `${runs} loop runs from one message delivered twice`;
    },
  },
  {
    key: "commission-on-completion",
    category: "FINANCE",
    intent: "Completing a trip charges RT's commission to the driver's balance, once.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, seats: 1, fareSom: 900 }),
    expect: "TRIP_COMPLETED",
    verify: async (r) => {
      const entries = await db.ledgerEntry.findMany({ where: { driverId: r.driverId! } });
      if (entries.length !== 1) return `${entries.length} ledger entries, expected exactly 1`;
      if (entries[0].type !== "COMMISSION_CHARGE") return `ledger entry is ${entries[0].type}`;
      const balance = await db.rtBalance.findUnique({ where: { driverId: r.driverId! } });
      return balance ? null : "commission charged with no balance row to charge it against";
    },
  },
  {
    key: "excess-baggage-intent",
    category: "FINANCE",
    intent: "Mira records an intent to collect, and no money moves.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead, excessBaggageFeeSom: 100 }),
    expect: "TRIP_COMPLETED",
    verify: async (r) => {
      const intents = await db.passengerFinancialIntent.findMany({ where: { tripId: r.tripId! } });
      if (intents.length !== 1) return `${intents.length} financial intents, expected exactly 1`;
      if (intents[0].amountSom !== 100) return `intent is for ${intents[0].amountSom} som, expected 100`;
      // No cashier has been appointed, so no cashier may be named. An intent
      // that claims a processor is an intent that claims a person acted.
      return intents[0].financialProcessor === null ? null : "an intent named a financial processor";
    },
  },
  {
    key: "no-fare-no-invented-price",
    category: "FINANCE",
    intent: "A trip closed without a reported fare does not acquire one.",
    spec: ({ ref, daysAhead }) => ({ ref, daysAhead }),
    expect: "TRIP_COMPLETED",
    verify: async (r) => {
      const trip = await db.trip.findUniqueOrThrow({ where: { id: r.tripId! } });
      return trip.totalFareSom === null ? null : `an unpriced trip closed at ${trip.totalFareSom} som`;
    },
  },
];

export const SCENARIOS_BY_KEY: ReadonlyMap<string, ScenarioDefinition> = new Map(
  SCENARIOS.map((s) => [s.key, s]),
);
