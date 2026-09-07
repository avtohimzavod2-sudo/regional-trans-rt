// DeliveryProviderAdapter — the interface every executor source (RT's own
// mock/manual estimator today; a real courier-company API, taxi partner
// API, etc. tomorrow) must implement (AGENTS spec s.23). Sapar's own logic
// never talks to a specific provider directly — only through this
// interface — so adding a new carrier type later never requires rewriting
// the orchestrator or matching engine.
//
// Capability-based (hardening spec s.8): a provider that can only quote
// (no live booking API yet) is still a valid adapter — getQuote/
// checkAvailability are the only two methods every provider must implement;
// createBooking/cancelBooking/getTracking are optional and absent entirely
// on a provider that doesn't support them, rather than throwing at runtime.
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
  createBooking?(shipmentPublicId: string, quote: DeliveryQuoteOffer): Promise<BookingResult>;
  cancelBooking?(bookingRef: string): Promise<void>;
  getTracking?(bookingRef: string): Promise<TrackingSnapshot>;
}

// ============================================================================
// SANDBOX-ONLY MOCK PROVIDER — NOT RT'S OFFICIAL TARIFFS.
// ============================================================================
// Every constant below is a development placeholder used until a real
// courier/taxi/delivery provider is wired in. It must never be presented to
// a client as a confirmed or official RT price — only ever as an estimate
// (see MOCK_PROVIDER_CODE / isMockProviderCode() below, which callers use to
// choose "ориентировочная стоимость" phrasing over a firm number). The owner
// has been explicitly flagged that these numbers need real-tariff review
// before this provider is ever treated as anything but a sandbox fallback
// (AGENTS hardening spec s.6/s.7).
const MOCK_BASE_FARE_SOM = 200;
const MOCK_PER_KG_SOM = 25;
const MOCK_PER_PIECE_SOM = 80;
const MOCK_MIN_FARE_SOM = 250;
const MOCK_EXPRESS_MULTIPLIER = 1.5;
const MOCK_STANDARD_PICKUP_LEAD_MS = 3 * 60 * 60 * 1000;
const MOCK_EXPRESS_PICKUP_LEAD_MS = 1 * 60 * 60 * 1000;
const MOCK_STANDARD_DELIVERY_LEAD_MS = 26 * 60 * 60 * 1000;
const MOCK_EXPRESS_DELIVERY_LEAD_MS = 6 * 60 * 60 * 1000;

export const MOCK_PROVIDER_CODE = "internal_mock";

/** Whether a providerCode refers to RT's sandbox estimator rather than a
 * real, production delivery provider — callers (reply composition, the
 * dispatcher UI) use this to decide "ориентировочная стоимость" vs a
 * firmer price phrasing, and must never treat a mock price as confirmed. */
export function isMockProviderCode(providerCode: string): boolean {
  return providerCode === MOCK_PROVIDER_CODE;
}

export class InternalMockDeliveryProvider implements DeliveryProviderAdapter {
  providerCode = MOCK_PROVIDER_CODE;

  async getQuote(input: DeliveryQuoteRequest): Promise<DeliveryQuoteOffer> {
    const isExpress = input.serviceLevel === "EXPRESS";
    const weightCharge = (input.weightKg ?? 0) * MOCK_PER_KG_SOM;
    const pieceCharge = (input.pieces ?? 1) * MOCK_PER_PIECE_SOM;
    const rawFare = MOCK_BASE_FARE_SOM + weightCharge + pieceCharge;
    const fare = Math.max(MOCK_MIN_FARE_SOM, isExpress ? rawFare * MOCK_EXPRESS_MULTIPLIER : rawFare);
    const now = Date.now();

    return {
      priceSom: Math.round(fare),
      currency: "KGS",
      estimatedPickupAt: new Date(now + (isExpress ? MOCK_EXPRESS_PICKUP_LEAD_MS : MOCK_STANDARD_PICKUP_LEAD_MS)),
      estimatedDeliveryAt: new Date(now + (isExpress ? MOCK_EXPRESS_DELIVERY_LEAD_MS : MOCK_STANDARD_DELIVERY_LEAD_MS)),
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
