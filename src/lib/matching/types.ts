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

export interface MatchableOffer {
  id: string;
  driverId: string;
  driverStatus: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "BLOCKED";
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
