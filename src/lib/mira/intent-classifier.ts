// Mira top-level intent classification (Mira Pass 1 spec s.2/s.24-B). This is
// a labeling layer ONLY — it never replaces the existing routing gates in
// orchestrator.ts (decideSaparRouting for cargo/parcel, quickClassifyMessage
// for passenger/driver). Those gates keep deciding control flow; this module
// adds the categories they don't cover (complaint/finance/partner) and gives
// every inbound message one CRM-reportable label, satisfying "Mira must
// distinguish at minimum: passenger trip, driver, parcel, cargo/freight,
// complaint/dispute, partner/business inquiry, finance/payment question,
// unknown/mixed intent" without duplicating any existing classifier.
import { decideSaparRouting } from "@/lib/sapar/routing-decision";
import { quickClassifyMessage } from "@/lib/agents/quick-classify";

export type MiraTopIntent =
  | "passenger_trip"
  | "driver"
  | "parcel"
  | "cargo_freight"
  | "complaint_dispute"
  | "partner_business"
  | "finance_payment"
  | "unknown_mixed";

export interface MiraTopIntentClassification {
  intent: MiraTopIntent;
  confidence: number;
  matchedSignals: string[];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ө/g, "о")
    .replace(/ү/g, "у")
    .replace(/ң/g, "н")
    .replace(/[.,!?;:()"'«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function allMatches(normalized: string, signals: string[]): string[] {
  return signals.filter((s) => normalized.includes(s));
}

// Complaint/dispute — checked first, since a complaint mentioned alongside a
// price or route question is still, first and foremost, a complaint (spec
// s.21: Mira must route complaints correctly, never treat them as routine).
const COMPLAINT_SIGNALS = [
  "жалоб", "жалуюсь", "недоволен", "недовольна", "обманул", "обманули",
  "разбил", "разбили", "потерял", "потеряли", "утерян", "не приехал",
  "не приехали", "испортил", "испортили", "хамил", "нахамил", "грубо",
  "верните деньги", "верните мои деньги", "хочу вернуть деньги", "compensation",
  "compensate", "complaint", "нааразы", "shikayat", "шикаят",
];

// Partner/business inquiries — B2B/franchise/cooperation, not a trip.
const PARTNER_SIGNALS = [
  "партнер", "партнёр", "сотрудничеств", "сотрудничать", "оптом", "b2b", "б2б",
  "франшиз", "franchise", "partnership", "corporate", "договор о сотрудничестве",
  "стать партнером", "стать партнёром",
];

// Finance/payment META questions — how RT bills/invoices/reconciles, NOT an
// ordinary "how much does the trip cost" question (that stays passenger_trip;
// narrow signals here are a deliberate precision-over-recall choice so a
// normal price question never gets misrouted away from the passenger flow).
const FINANCE_SIGNALS = [
  "как оплатить", "способ оплаты", "безналич", "реквизит", "счет пришлите",
  "счёт пришлите", "выставите счет", "выставьте счет", "комисси", "инвойс",
  "invoice", "payment method", "как вам заплатить", "куда переводить деньги",
];

// Small personal items vs. commercial/bulk cargo — labels only; Sapar's own
// gate (decideSaparRouting) still owns the actual routing decision, and its
// Shipment model already handles both under one flow (spec s.23: don't split
// one domain concept into two parallel pipelines).
const SMALL_ITEM_SIGNALS = ["посылк", "package", "parcel", "posylk", "баштык", "сумк"];

export function classifyMiraTopIntent(text: string): MiraTopIntentClassification {
  const normalized = normalize(text);

  const complaintHits = allMatches(normalized, COMPLAINT_SIGNALS);
  if (complaintHits.length > 0) {
    return { intent: "complaint_dispute", confidence: Math.min(1, complaintHits.length / 2), matchedSignals: complaintHits };
  }

  const partnerHits = allMatches(normalized, PARTNER_SIGNALS);
  if (partnerHits.length > 0) {
    return { intent: "partner_business", confidence: Math.min(1, partnerHits.length / 2), matchedSignals: partnerHits };
  }

  const financeHits = allMatches(normalized, FINANCE_SIGNALS);
  if (financeHits.length > 0) {
    return { intent: "finance_payment", confidence: Math.min(1, financeHits.length / 2), matchedSignals: financeHits };
  }

  const saparDecision = decideSaparRouting(text);
  if (saparDecision.required && saparDecision.matchedSignal) {
    const isSmallItem = SMALL_ITEM_SIGNALS.some((s) => saparDecision.matchedSignal!.includes(s) || s.includes(saparDecision.matchedSignal!));
    return {
      intent: isSmallItem ? "parcel" : "cargo_freight",
      confidence: 0.8,
      matchedSignals: [saparDecision.matchedSignal],
    };
  }

  const quick = quickClassifyMessage(text);
  if (quick.role === "passenger" && quick.confidence > 0) {
    return { intent: "passenger_trip", confidence: quick.confidence, matchedSignals: quick.matchedSignals };
  }
  if (quick.role === "driver" && quick.confidence > 0) {
    return { intent: "driver", confidence: quick.confidence, matchedSignals: quick.matchedSignals };
  }
  if (quick.role === "parcel_sender" && quick.confidence > 0) {
    return { intent: "parcel", confidence: quick.confidence, matchedSignals: quick.matchedSignals };
  }

  return { intent: "unknown_mixed", confidence: 0, matchedSignals: quick.matchedSignals };
}
