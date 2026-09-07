// The Customer Confirmation Gate (AGENTS hardening spec s.3/s.4/s.32 — the
// single most important rule of this stage): handleSaparInbound() only ever
// searches, ranks, and proposes; it stops at AWAITING_CONFIRMATION. Nothing
// in this codebase may create a ShipmentLeg, assign an executor, or move a
// shipment to CONFIRMED except the explicit, separate actions in this file.
// RECOMMENDATION != BOOKING.
//
// Kept deliberately apart from matching.ts/orchestrator.ts so ranking/quote
// generation/provider selection code never mixes with confirmation logic
// (spec s.4's explicit instruction).
import type { AgentContext } from "@/lib/agents/types";
import { logAgentAction } from "@/lib/agents/trace";
import { db } from "@/lib/db";
import type { Language, ShipmentQuoteSource, ShipmentQuoteStatus, ShipmentStatus } from "@prisma/client";
import { transitionShipment } from "./lifecycle";
import { emitSapargulEvent } from "./events";
import { isMockProviderCode } from "./provider";
import { openShipmentIncident } from "./incidents";
import type { SaparResult } from "./types";
import { requestShipmentPayment } from "@/lib/sapargul/payment";

export class ShipmentNotAwaitingConfirmationError extends Error {
  constructor(shipmentId: string, status: ShipmentStatus) {
    super(`Shipment ${shipmentId} is not awaiting confirmation (status=${status})`);
    this.name = "ShipmentNotAwaitingConfirmationError";
  }
}

export class ShipmentQuoteNotFoundError extends Error {
  constructor(shipmentId: string, quoteId?: string | null) {
    super(`No confirmable quote found for shipment ${shipmentId}${quoteId ? ` (quoteId=${quoteId})` : ""}`);
    this.name = "ShipmentQuoteNotFoundError";
  }
}

export type ConfirmationGateState = "PENDING" | "ALREADY_DONE" | "INVALID";

// Statuses reachable only by having already passed through a real
// confirmShipmentQuote() call — a repeat confirmation call landing on one of
// these must be a safe no-op, never a second booking (spec s.21 idempotency).
const ALREADY_CONFIRMED_STATUSES: ShipmentStatus[] = [
  "CONFIRMED",
  "AWAITING_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "AT_TRANSFER_POINT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DISPUTED",
];

/** Pure: classify a shipment's current status for confirmation purposes. */
export function canConfirmShipment(status: ShipmentStatus): ConfirmationGateState {
  if (status === "AWAITING_CONFIRMATION") return "PENDING";
  if (ALREADY_CONFIRMED_STATUSES.includes(status)) return "ALREADY_DONE";
  return "INVALID";
}

export interface RankableQuoteRef {
  id: string;
  status: ShipmentQuoteStatus;
  rankScore: number | null;
}

/** Pure: pick the best remaining still-open quote after one is rejected —
 * models "Найти другой вариант" (spec s.15) without any new ShipmentStatus
 * transition (the shipment simply stays in AWAITING_CONFIRMATION while the
 * proposed quote changes). */
export function pickNextOfferedQuote(quotes: RankableQuoteRef[], excludeId: string): RankableQuoteRef | null {
  const candidates = quotes.filter((q) => q.id !== excludeId && (q.status === "OFFERED" || q.status === "RECOMMENDED"));
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))[0];
}

export type ConfirmationIntent = "CONFIRM" | "REJECT" | "UNCLEAR";

// Checked before CONFIRM_PHRASES so a negated confirmation ("не
// подтверждаю") is never misread as a confirm just because it contains the
// substring "подтвержда". Deliberately no \b anchors — \b is defined via
// \w (ASCII letters/digits only) and never fires reliably around Cyrillic
// text (see extract.ts's FROM_SUFFIX/TO_SUFFIX comment for the same bug),
// so short ambiguous tokens (да/нет/ok/no) are matched via exact-token
// comparison instead of a regex word boundary.
const REJECT_PHRASES = [
  "не подтвержда",
  "не согласен",
  "не согласна",
  "не надо",
  "не подходит",
  "другой вариант",
  "другую доставку",
  "отмена",
  "отменить",
  "отказ",
  "cancel",
  "different option",
  "another option",
  "жок",
  "болбойт",
];
const REJECT_WORDS = new Set(["нет", "no"]);

const CONFIRM_PHRASES = ["подтвержда", "подтвердить", "согласен", "согласна", "confirm", "макул", "жарайт"];
const CONFIRM_WORDS = new Set(["да", "ок", "окей", "хорошо", "ok", "okay", "yes", "болот", "туура"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zа-яёүөң]+/iu)
    .filter(Boolean);
}

/** Pure: classify a free-text follow-up reply from a customer whose shipment
 * is sitting at AWAITING_CONFIRMATION (spec s.15's Подтвердить/Найти другой
 * вариант client UX, applied to a real chat reply rather than a button). */
export function classifyConfirmationReply(text: string): ConfirmationIntent {
  const lower = text.toLowerCase();
  const words = tokenize(text);

  if (REJECT_PHRASES.some((p) => lower.includes(p)) || words.some((w) => REJECT_WORDS.has(w))) return "REJECT";
  if (CONFIRM_PHRASES.some((p) => lower.includes(p)) || words.some((w) => CONFIRM_WORDS.has(w))) return "CONFIRM";
  return "UNCLEAR";
}

interface ResultShipment {
  id: string;
  publicId: string;
  status: ShipmentStatus;
  language: Language;
  riskFlags: string[];
  riskReason: string | null;
}

interface ResultQuote {
  priceSom: number | null;
  priceSource: ShipmentQuoteSource;
  estimatedPickupAt: Date | null;
  estimatedDeliveryAt: Date | null;
  providerCode: string;
}

// BLOCK/ESCALATE shipments can never reach AWAITING_CONFIRMATION (the risk
// gate runs before matching in handleSaparInbound), so it's always accurate
// to report LOW/ALLOW from this point in the lifecycle onward.
// Looks up the shipment's current ShipmentPayment (if any) itself rather
// than threading it through every call site — so every return path
// (fresh confirmation, idempotent repeat, reject/cancel) reports the same,
// always-current Payment Gate state without duplicating the query logic.
async function buildResult(shipment: ResultShipment, quote: ResultQuote | null, assignedExecutorName: string | null): Promise<SaparResult> {
  const payment = await db.shipmentPayment.findUnique({ where: { shipmentId: shipment.id } });
  const destination = payment?.destinationId ? await db.paymentDestination.findUnique({ where: { id: payment.destinationId } }) : null;

  return {
    shipmentId: shipment.id,
    publicId: shipment.publicId,
    status: shipment.status,
    language: shipment.language,
    missingFields: [],
    risk: { level: "LOW", action: "ALLOW", flags: shipment.riskFlags, reason: shipment.riskReason },
    recommendedQuote: quote
      ? {
          priceSom: quote.priceSom,
          priceSource: quote.priceSource,
          estimatedPickupAt: quote.estimatedPickupAt,
          estimatedDeliveryAt: quote.estimatedDeliveryAt,
          isMockPricing: isMockProviderCode(quote.providerCode),
        }
      : null,
    assignedExecutorName,
    incidentOpened: false,
    paymentInstructions:
      payment && destination
        ? {
            orderReference: payment.orderReference,
            amountSom: payment.amountExpectedSom,
            currency: payment.currency,
            destinationLabel: destination.label,
            destinationMethod: destination.method,
            instructionsText: destination.instructionsText,
            isSandbox: destination.environment === "SANDBOX",
          }
        : null,
  };
}

/** Find a shipment currently sitting at the confirmation gate for a given
 * Mira conversation — used by the Mira orchestrator to recognize a
 * follow-up "да"/"другой вариант" reply as belonging to this shipment
 * rather than re-running cargo extraction on it. */
export async function findShipmentAwaitingConfirmation(conversationId: string | undefined) {
  if (!conversationId) return null;
  return db.shipment.findFirst({ where: { conversationId, status: "AWAITING_CONFIRMATION" }, orderBy: { createdAt: "desc" } });
}

/** The only place a Shipment may move to CONFIRMED and get a
 * ShipmentLeg/executor assignment. Idempotent: calling this again after a
 * shipment has already been confirmed (or progressed further) is a safe
 * no-op, never a second leg/assignment. */
export async function confirmShipmentQuote(ctx: AgentContext, shipmentId: string, quoteId?: string): Promise<SaparResult> {
  const shipment = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  const gate = canConfirmShipment(shipment.status);

  if (gate === "INVALID") {
    throw new ShipmentNotAwaitingConfirmationError(shipmentId, shipment.status);
  }

  if (gate === "ALREADY_DONE") {
    const quote = shipment.selectedQuoteId ? await db.shipmentQuote.findUnique({ where: { id: shipment.selectedQuoteId } }) : null;
    const assignedExecutor = shipment.assignedExecutorId ? await db.deliveryExecutor.findUnique({ where: { id: shipment.assignedExecutorId } }) : null;
    return buildResult(shipment, quote, assignedExecutor?.name ?? null); // idempotent repeat: reports current Payment Gate state, never re-requests
  }

  const targetQuoteId = quoteId ?? shipment.selectedQuoteId;
  const quote = targetQuoteId
    ? await db.shipmentQuote.findFirst({ where: { id: targetQuoteId, shipmentId, status: { in: ["OFFERED", "RECOMMENDED"] } } })
    : null;
  if (!quote) throw new ShipmentQuoteNotFoundError(shipmentId, targetQuoteId);

  await db.shipmentQuote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
  await db.shipmentQuote.updateMany({
    where: { shipmentId, id: { not: quote.id }, status: { in: ["OFFERED", "RECOMMENDED"] } },
    data: { status: "EXPIRED" },
  });
  await db.shipment.update({ where: { id: shipmentId }, data: { selectedQuoteId: quote.id } });
  await transitionShipment(ctx, shipmentId, "CONFIRMED");
  await emitSapargulEvent(ctx, "QUOTE_ACCEPTED", shipmentId, { quoteId: quote.id, priceSom: quote.priceSom, priceSource: quote.priceSource });

  let assignedExecutor: { id: string; name: string } | null = null;
  if (quote.executorId) {
    const executor = await db.deliveryExecutor.findUnique({ where: { id: quote.executorId } });
    if (executor && executor.status === "ACTIVE") {
      assignedExecutor = executor;
    } else if (executor) {
      await openShipmentIncident(ctx, {
        shipmentId,
        type: "executor_unavailable_at_confirmation",
        severity: "MEDIUM",
        description: `Ранее предложенный исполнитель ${executor.name} более не активен (status=${executor.status}) на момент подтверждения клиентом.`,
        openedByType: "AGENT",
      });
    }
  }

  await db.shipmentLeg.create({
    data: {
      shipmentId,
      sequence: 0,
      kind: "PICKUP",
      originText: shipment.pickupText,
      destinationText: shipment.destinationText,
      executorId: assignedExecutor?.id ?? null,
      status: assignedExecutor ? "ASSIGNED" : "PLANNED",
      plannedAt: quote.estimatedPickupAt,
    },
  });

  if (assignedExecutor) {
    await db.shipment.update({ where: { id: shipmentId }, data: { assignedExecutorId: assignedExecutor.id } });
    await emitSapargulEvent(ctx, "COURIER_ASSIGNED", shipmentId, { executorId: assignedExecutor.id, executorName: assignedExecutor.name });
  }

  // Payment Gate (Sapargul, AGENTS Sapargul spec s.5/s.16/s.43): the
  // shipment deliberately stays at CONFIRMED — never auto-advanced to
  // AWAITING_PICKUP here. Only the head treasurer's confirmActualPaymentReceipt
  // (src/lib/sapargul/treasury.ts) may open the gate and let Sapar continue.
  if (quote.priceSom != null) {
    await requestShipmentPayment(ctx, shipmentId, quote.priceSom, quote.currency);
  } else {
    await openShipmentIncident(ctx, {
      shipmentId,
      type: "payment_amount_not_available",
      severity: "MEDIUM",
      description: "Quote confirmed without a priceSom set — cannot request payment until pricing is finalized.",
      openedByType: "AGENT",
    });
  }

  await logAgentAction({
    ctx,
    agent: "SAPAR",
    action: "sapar.customer_confirmed",
    entityType: "Shipment",
    entityId: shipmentId,
    details: { quoteId: quote.id, assignedExecutorId: assignedExecutor?.id ?? null },
  });

  const finalShipment = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  return buildResult(finalShipment, quote, assignedExecutor?.name ?? null);
}

export interface RejectShipmentQuoteOptions {
  reason?: string;
  /** Default true — offer the next-best remaining option instead of
   * cancelling outright, per spec s.4's rejection path. */
  requestAlternative?: boolean;
}

/** The only place a proposed quote may be declined. Never creates a
 * ShipmentLeg or assigns an executor — either swaps the proposed quote
 * (customer stays at AWAITING_CONFIRMATION) or cancels the shipment when no
 * alternative remains. Idempotent against a shipment already CANCELLED. */
export async function rejectShipmentQuote(ctx: AgentContext, shipmentId: string, options: RejectShipmentQuoteOptions = {}): Promise<SaparResult> {
  const shipment = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });

  if (shipment.status === "CANCELLED") {
    return buildResult(shipment, null, null);
  }
  if (shipment.status !== "AWAITING_CONFIRMATION") {
    throw new ShipmentNotAwaitingConfirmationError(shipmentId, shipment.status);
  }

  const rejectedQuoteId = shipment.selectedQuoteId;
  if (rejectedQuoteId) {
    await db.shipmentQuote.update({ where: { id: rejectedQuoteId }, data: { status: "REJECTED" } });
  }

  await logAgentAction({
    ctx,
    agent: "SAPAR",
    action: "sapar.customer_rejected_option",
    entityType: "Shipment",
    entityId: shipmentId,
    details: { rejectedQuoteId, reason: options.reason ?? null },
  });

  const requestAlternative = options.requestAlternative !== false;
  if (requestAlternative && rejectedQuoteId) {
    const remaining = await db.shipmentQuote.findMany({ where: { shipmentId, status: { in: ["OFFERED", "RECOMMENDED"] } } });
    const next = pickNextOfferedQuote(
      remaining.map((q) => ({ id: q.id, status: q.status, rankScore: q.rankScore })),
      rejectedQuoteId,
    );
    if (next) {
      const nextRow = await db.shipmentQuote.update({ where: { id: next.id }, data: { status: "RECOMMENDED" } });
      const finalShipment = await db.shipment.update({ where: { id: shipmentId }, data: { selectedQuoteId: next.id } });
      return buildResult(finalShipment, nextRow, null);
    }
  }

  await transitionShipment(ctx, shipmentId, "CANCELLED", { cancelReason: options.reason ?? "customer_rejected_all_options" });
  await emitSapargulEvent(ctx, "DELIVERY_CANCELLED", shipmentId, { reason: "customer_rejected" });
  const finalShipment = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  return buildResult(finalShipment, null, null);
}
