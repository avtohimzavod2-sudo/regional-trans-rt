// Scenario/simulation test factories (hardening sprint s.14). Field shapes
// deliberately mirror the plain fixture objects already hand-built across
// src/lib/matching/*.test.ts (see orchestrate.test.ts's matchRecord /
// requestRecord) rather than inventing a new shape — these are the record
// shapes the real orchestrator/expiry code actually destructures.
let counter = 0;

/** Test-only: resets the id counter so a test file asserting on exact
 * generated ids (rather than just uniqueness) gets deterministic output. */
export function resetFactoryCounter(): void {
  counter = 0;
}

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export interface TestDriver {
  telegramUserId: string;
  preferredLang: string;
  phone: string | null;
  name: string;
  carModel: string | null;
  carPlate: string | null;
}

export function makeDriver(overrides: Partial<TestDriver> = {}): TestDriver {
  const id = nextId("driver");
  return {
    telegramUserId: `tg-${id}`,
    preferredLang: "RU",
    phone: null,
    name: "Test Driver",
    carModel: null,
    carPlate: null,
    ...overrides,
  };
}

export interface TestPassenger {
  whatsappId: string;
  preferredLang: string;
  phone: string | null;
  name: string;
}

export function makePassenger(overrides: Partial<TestPassenger> = {}): TestPassenger {
  const id = nextId("passenger");
  return {
    whatsappId: `wa-${id}`,
    preferredLang: "RU",
    phone: null,
    name: "Test Passenger",
    ...overrides,
  };
}

export interface TestTripRequest {
  id: string;
  passengerId: string;
  seats: number;
  pickupPoint: string;
  passenger: TestPassenger;
}

export function makeTripRequest(overrides: Partial<Omit<TestTripRequest, "passenger">> & { passenger?: TestPassenger } = {}): TestTripRequest {
  const { passenger, ...rest } = overrides;
  return {
    id: nextId("req"),
    passengerId: nextId("passenger-id"),
    seats: 1,
    pickupPoint: "Test Pickup",
    ...rest,
    passenger: passenger ?? makePassenger(),
  };
}

export interface TestDriverOffer {
  driverId: string;
  driver: TestDriver;
}

export function makeDriverOffer(overrides: Partial<Omit<TestDriverOffer, "driver">> & { driver?: TestDriver } = {}): TestDriverOffer {
  const { driver, ...rest } = overrides;
  return {
    driverId: nextId("driver-id"),
    ...rest,
    driver: driver ?? makeDriver(),
  };
}

export interface TestMatch {
  id: string;
  status: string;
  tripRequestId: string;
  driverOfferId: string;
  driverOffer: TestDriverOffer;
  tripRequest: TestTripRequest;
}

export function makeMatch(
  overrides: Partial<Omit<TestMatch, "driverOffer" | "tripRequest">> & {
    driverOffer?: TestDriverOffer;
    tripRequest?: TestTripRequest;
  } = {},
): TestMatch {
  const { driverOffer, tripRequest, ...rest } = overrides;
  const resolvedTripRequest = tripRequest ?? makeTripRequest();
  return {
    id: nextId("match"),
    status: "AWAITING_DRIVER",
    tripRequestId: resolvedTripRequest.id,
    driverOfferId: nextId("offer"),
    ...rest,
    driverOffer: driverOffer ?? makeDriverOffer(),
    tripRequest: resolvedTripRequest,
  };
}
