// DeliveryProviderAdapter — the interface every executor source (RT's own
// mock/manual estimator today; a real courier-company API, taxi partner
// API, etc. tomorrow) must implement (AGENTS spec s.23). Sapar's own logic
// never talks to a specific provider directly — only through this
// interface — so adding a new carrier type later never requires rewriting
// the orchestrator or matching engine.
import { nanoid } from "nanoid";

export interface DeliveryQuoteRequest {
  weightKg: number | null;
  pieces: number | null;
  serviceLevel: string; // "STANDARD" | "EXPRESS"
  doorToDoor: boolean;
}

export interface DeliveryQuoteOffer {
  priceSom: number;
  currency: "KGS";
  estimatedPickupAt: Date;
  estimatedDeliveryAt: Date;
  serviceType: string;
  confidence: number; // 0..1 — how much to trust this estimate
}

export interface BookingResult {
  bookingRef: string;
  confirmedAt: Date;
}

export interface TrackingSnapshot {
  status: string;
  lastUpdateAt: Date;
}

export interface DeliveryProviderAdapter {
  providerCode: string;
  getQuote(input: DeliveryQuoteRequest): Promise<DeliveryQuoteOffer>;
  checkAvailability(input: DeliveryQuoteRequest): Promise<boolean>;
  createBooking(shipmentPublicId: string, quote: DeliveryQuoteOffer): Promise<BookingResult>;
  cancelBooking(bookingRef: string): Promise<void>;
  getTracking(bookingRef: string): Promise<TrackingSnapshot>;
}

// RT's own deterministic internal tariff/estimator — a valid, honest price
// source per AGENTS spec s.11 ("RT calculated tariff"), clearly separate
// from a CONFIRMED external quote. No network call, so it can never hang or
// fail like a real provider would; used until a real courier/taxi/delivery
// API is wired in. Tariff numbers here are a placeholder starting point,
// not RT's actual pricing — flagged in the final report for the owner to
// confirm/replace.
const BASE_FARE_SOM = 200;
const PER_KG_SOM = 25;
const PER_PIECE_SOM = 80;
const MIN_FARE_SOM = 250;
const EXPRESS_MULTIPLIER = 1.5;
const STANDARD_PICKUP_LEAD_MS = 3 * 60 * 60 * 1000;
const EXPRESS_PICKUP_LEAD_MS = 1 * 60 * 60 * 1000;
const STANDARD_DELIVERY_LEAD_MS = 26 * 60 * 60 * 1000;
const EXPRESS_DELIVERY_LEAD_MS = 6 * 60 * 60 * 1000;

export class InternalMockDeliveryProvider implements DeliveryProviderAdapter {
  providerCode = "internal_mock";

  async getQuote(input: DeliveryQuoteRequest): Promise<DeliveryQuoteOffer> {
    const isExpress = input.serviceLevel === "EXPRESS";
    const weightCharge = (input.weightKg ?? 0) * PER_KG_SOM;
    const pieceCharge = (input.pieces ?? 1) * PER_PIECE_SOM;
    const rawFare = BASE_FARE_SOM + weightCharge + pieceCharge;
    const fare = Math.max(MIN_FARE_SOM, isExpress ? rawFare * EXPRESS_MULTIPLIER : rawFare);
    const now = Date.now();

    return {
      priceSom: Math.round(fare),
      currency: "KGS",
      estimatedPickupAt: new Date(now + (isExpress ? EXPRESS_PICKUP_LEAD_MS : STANDARD_PICKUP_LEAD_MS)),
      estimatedDeliveryAt: new Date(now + (isExpress ? EXPRESS_DELIVERY_LEAD_MS : STANDARD_DELIVERY_LEAD_MS)),
      serviceType: isExpress ? "EXPRESS" : "STANDARD",
      confidence: 0.5, // a flat internal estimate, not a route-aware or executor-confirmed price
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true; // the internal estimator is always "available" — it never calls out
  }

  async createBooking(shipmentPublicId: string, _quote: DeliveryQuoteOffer): Promise<BookingResult> {
    return { bookingRef: `mock_${shipmentPublicId}_${nanoid(6)}`, confirmedAt: new Date() };
  }

  async cancelBooking(): Promise<void> {
    // No-op: nothing external was ever booked.
  }

  async getTracking(): Promise<TrackingSnapshot> {
    // The internal provider has no tracking feed of its own — Sapar's own
    // ShipmentLeg/status lifecycle is the source of truth for tracking.
    return { status: "SEE_SHIPMENT_LIFECYCLE", lastUpdateAt: new Date() };
  }
}

export function getSaparDeliveryProvider(): DeliveryProviderAdapter {
  return new InternalMockDeliveryProvider();
}
