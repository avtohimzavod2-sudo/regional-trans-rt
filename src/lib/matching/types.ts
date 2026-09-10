export interface StopRef {
  id: string;
  corridorId: string;
  order: number;
}

export interface MatchableRequest {
  id: string;
  origin: StopRef;
  destination: StopRef;
  travelDate: Date;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  seats: number;
}

/** Existing RT Scout classification (see Driver.category, prisma/schema.prisma)
 * of how established this driver is with RT — reused here, not reinvented, as
 * the "registered/known RT driver" signal for spec s.3's priority requirement.
 * ANCHOR/DISPATCHER_FLEET/REGULAR drivers have a real RT track record;
 * OCCASIONAL/UNKNOWN do not (yet) — everyone in this pool is still already
 * DriverStatus.ACTIVE (verified), since isEligibleOffer filters that
 * separately; this only breaks ties among already-eligible offers. */
export type DriverCategory = "UNKNOWN" | "OCCASIONAL" | "REGULAR" | "ANCHOR" | "DISPATCHER_FLEET";

export interface MatchableOffer {
  id: string;
  driverId: string;
  driverStatus: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "BLOCKED";
  driverCategory: DriverCategory;
  origin: StopRef;
  destination: StopRef;
  travelDate: Date;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  seatsAvailable: number;
  status: "OPEN" | "PARTIALLY_FILLED" | "FULL" | "CLOSED" | "CANCELLED";
  createdAt: Date;
}

export interface ScoredOffer {
  offer: MatchableOffer;
  score: number;
}

export interface ScoredRequest {
  request: MatchableRequest;
  score: number;
}
