// Сапар (Sapar) — cargo/parcel delivery orchestrator. This is the single
// entrypoint (handleSaparInbound) that Mira calls once she's decided
// CARGO_DELIVERY is required via routing-decision.ts. Mirrors
// src/lib/jolchu/orchestrator.ts's role: trace events at start/end, a
// `persist !== false` test convention, and ctx threading so Sapar's own
// logAgentAction calls share Mira's traceId.
//
// Sapar builds and owns a Shipment end to end for this MVP stage (AGENTS
// spec s.52): extract -> risk gate -> create/update -> (if clear) match ->
// auto-select the recommended quote -> assign an executor if one covers the
// route -> advance to AWAITING_PICKUP. There is no real payment gate and no
// real external booking anywhere in this path (both are explicitly out of
// scope project-wide), so "confirming" a quote here is a safe, reversible,
// internal-only state change — never a real transaction with a real driver
// or a real charge.
import { nanoid } from "nanoid";
import type { Channel, DeliveryExecutor, Language, ShipmentRiskLevel } from "@prisma/client";
import { db } from "@/lib/db";
import { logAgentAction, rootContext } from "@/lib/agents/trace";
import type { AgentContext, AgentContract } from "@/lib/agents/types";
import { extractShipmentFields } from "./extract";
import { evaluateShipmentRisk } from "./risk";
import { rankQuoteCandidates } from "./matching";
import { computeReliabilityScore, findCandidateExecutors } from "./executors";
import { getSaparDeliveryProvider, isMockProviderCode } from "./provider";
import { canTransitionShipment, transitionShipment } from "./lifecycle";
import { openShipmentIncident } from "./incidents";
import { emitSapargulEvent } from "./events";
import {
  REQUIRED_SHIPMENT_FIELDS,
  type QuoteCandidate,
  type RequiredShipmentField,
  type SaparResult,
  type ShipmentCargoRequirements,
} from "./types";

export const SAPAR_AGENT_CONTRACT: AgentContract = {
  name: "SAPAR",
  mission:
    "Be RT's cargo/parcel delivery orchestrator: turn a free-text delivery request into a normalized Shipment, run the risk gate, build and rank delivery options across RT's hybrid executor network, and carry the order through its lifecycle — while Sapargul (a future agent) owns everything money-related.",
  inputs: ["free-text delivery request (any of Kyrgyz/Russian/English/mixed)", "Mira conversation id (optional, for multi-turn continuation)"],
  outputs: ["Shipment record", "ShipmentQuote(s)", "ShipmentLeg(s)", "SaparResult for Mira's reply"],
  permissions: ["read/write Shipment/ShipmentLeg/ShipmentQuote/DeliveryExecutor/ShipmentIncident", "write AuditLogEntry"],
  prohibitedActions: [
    "never invent a price, ETA, executor, or availability not backed by a QuoteCandidate/DeliveryExecutor record",
    "never move or confirm money — that is Sapargul's job",
    "never auto-proceed past an ELEVATED or BLOCKED risk decision without a human",
    "never make a real external booking — only the internal mock provider is wired in this stage",
    "never transition a Shipment to CONFIRMED without an explicit, separate customer confirmation action (confirmShipmentQuote) — finding/ranking/proposing the best option is never the same as booking it",
  ],
  kpi: ["% of requests resolved without an unnecessary clarification question", "risk-gate false-negative rate (target: 0 for BLOCK-tier cargo)", "time to first quote"],
  escalationRules: [
    "risk gate returns BLOCK -> shipment is cancelled, never organized, and a CRITICAL incident is opened for audit",
    "risk gate returns ESCALATE -> matching/auto-confirm is skipped and a dispatcher-reviewable incident is opened",
  ],
};

export interface SaparInboundParams {
  channel: Channel;
  language: Language;
  senderContact: string;
  text: string;
  conversationId?: string;
  ctx?: AgentContext;
  /** Defaults to true; set false in tests to skip all database writes. */
  persist?: boolean;
}

function generatePublicId(): string {
  return `SPR-${nanoid(8).toUpperCase()}`;
}

function moreSevere(a: ShipmentRiskLevel, b: ShipmentRiskLevel): ShipmentRiskLevel {
  const order: ShipmentRiskLevel[] = ["LOW", "ELEVATED", "BLOCKED"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function firstNonEmpty(existing: string | null, incoming: string | null): string | null {
  const cleaned = existing?.trim();
  return cleaned ? existing : incoming;
}

async function findOpenDraftShipment(conversationId: string | undefined) {
  if (!conversationId) return null;
  return db.shipment.findFirst({
    where: { conversationId, status: { in: ["DRAFT", "NEEDS_INFO"] } },
    orderBy: { createdAt: "desc" },
  });
}

function missingRequiredFields(fields: { pickupText: string; destinationText: string; cargoDescription: string | null }): RequiredShipmentField[] {
  return REQUIRED_SHIPMENT_FIELDS.filter((field) => {
    const value = fields[field as keyof typeof fields];
    return !value || (typeof value === "string" && value.trim().length === 0);
  });
}

async function buildQuoteCandidates(params: {
  weightKg: number | null;
  pieces: number | null;
  serviceLevel: string;
  doorToDoor: boolean;
  pickupText: string;
  destinationText: string;
  requirements: ShipmentCargoRequirements;
}): Promise<{ candidates: QuoteCandidate[]; executorsById: Map<string, DeliveryExecutor> }> {
  const provider = getSaparDeliveryProvider();
  const offer = await provider.getQuote({
    weightKg: params.weightKg,
    pieces: params.pieces,
    serviceLevel: params.serviceLevel,
    doorToDoor: params.doorToDoor,
  });

  const baseCandidate: QuoteCandidate = {
    providerCode: provider.providerCode,
    executorId: null,
    executorSource: null,
    executorReliabilityScore: null,
    executorVerification: null,
    priceSom: offer.priceSom,
    priceSource: "ESTIMATE",
    currency: "KGS",
    estimatedPickupAt: offer.estimatedPickupAt,
    estimatedDeliveryAt: offer.estimatedDeliveryAt,
    serviceType: offer.serviceType,
    doorToDoor: params.doorToDoor,
    lastMileIncluded: true,
    confidence: offer.confidence,
    rankScore: 0,
    rankReasons: [],
    legKinds: ["PICKUP", "INTERCITY", "LAST_MILE"],
  };

  const candidateExecutors = await findCandidateExecutors(params.pickupText, params.destinationText, params.requirements);
  const executorsById = new Map(candidateExecutors.map((e) => [e.id, e]));

  const executorCandidates: QuoteCandidate[] = candidateExecutors.slice(0, 3).map((executor) => ({
    ...baseCandidate,
    executorId: executor.id,
    executorSource: executor.source,
    executorReliabilityScore: computeReliabilityScore(executor),
    executorVerification: executor.verificationStatus,
    legKinds: ["PICKUP", "LAST_MILE"],
  }));

  return { candidates: [baseCandidate, ...executorCandidates], executorsById };
}

export async function handleSaparInbound(params: SaparInboundParams): Promise<SaparResult> {
  const ctx = params.ctx ?? rootContext();
  const persist = params.persist !== false;

  await logAgentAction({
    ctx,
    agent: "SAPAR",
    action: "sapar.request_received",
    entityType: "Shipment",
    entityId: params.conversationId ?? "unknown",
    details: { channel: params.channel, language: params.language },
  });

  const extraction = extractShipmentFields(params.text);
  const risk = evaluateShipmentRisk(params.text, extraction);

  if (!persist) {
    // Test-only short-circuit: no DB, just report what extraction/risk found.
    const missing = REQUIRED_SHIPMENT_FIELDS.filter((f) => {
      const v = { pickupText: extraction.pickupText, destinationText: extraction.destinationText, cargoDescription: extraction.cargoDescription }[f];
      return !v;
    });
    return {
      shipmentId: "unpersisted",
      publicId: "unpersisted",
      status: risk.action === "BLOCK" ? "CANCELLED" : missing.length > 0 ? "NEEDS_INFO" : "READY_FOR_MATCHING",
      language: params.language,
      missingFields: missing,
      risk,
      recommendedQuote: null,
      assignedExecutorName: null,
      incidentOpened: risk.action !== "ALLOW",
      paymentInstructions: null,
    };
  }

  const existing = await findOpenDraftShipment(params.conversationId);

  const mergedPickup = firstNonEmpty(existing?.pickupText ?? null, extraction.pickupText) ?? "";
  const mergedDestination = firstNonEmpty(existing?.destinationText ?? null, extraction.destinationText) ?? "";
  const mergedCargo = firstNonEmpty(existing?.cargoDescription ?? null, extraction.cargoDescription);
  const mergedRiskFlags = Array.from(new Set([...(existing?.riskFlags ?? []), ...risk.flags]));
  const mergedRiskLevel = existing ? moreSevere(existing.riskLevel, risk.level) : risk.level;
  const mergedRiskReason = existing?.riskReason ?? risk.reason;
  const missing = missingRequiredFields({ pickupText: mergedPickup, destinationText: mergedDestination, cargoDescription: mergedCargo });

  const shipment = existing
    ? await db.shipment.update({
        where: { id: existing.id },
        data: {
          pickupText: mergedPickup,
          destinationText: mergedDestination,
          cargoDescription: mergedCargo,
          missingFields: missing,
          pieces: existing.pieces ?? extraction.pieces,
          weightKg: existing.weightKg ?? extraction.weightKg,
          dimensions: existing.dimensions ?? extraction.dimensions,
          preferredPickupTime: existing.preferredPickupTime ?? extraction.preferredPickupTime,
          declaredValueSom: existing.declaredValueSom ?? extraction.declaredValueSom,
          fragile: existing.fragile || extraction.fragile,
          perishable: existing.perishable || extraction.perishable,
          temperatureControlled: existing.temperatureControlled || extraction.temperatureControlled,
          specialHandling: existing.specialHandling ?? extraction.specialHandling,
          riskFlags: mergedRiskFlags,
          riskLevel: mergedRiskLevel,
          riskReason: mergedRiskReason,
        },
      })
    : await db.shipment.create({
        data: {
          publicId: generatePublicId(),
          conversationId: params.conversationId ?? null,
          channel: params.channel,
          language: params.language,
          senderContact: params.senderContact,
          pickupText: mergedPickup,
          destinationText: mergedDestination,
          cargoDescription: mergedCargo,
          missingFields: missing,
          pieces: extraction.pieces,
          weightKg: extraction.weightKg,
          dimensions: extraction.dimensions,
          preferredPickupTime: extraction.preferredPickupTime,
          declaredValueSom: extraction.declaredValueSom,
          fragile: extraction.fragile,
          perishable: extraction.perishable,
          temperatureControlled: extraction.temperatureControlled,
          specialHandling: extraction.specialHandling,
          riskFlags: mergedRiskFlags,
          riskLevel: mergedRiskLevel,
          riskReason: mergedRiskReason,
          traceId: ctx.traceId,
        },
      });

  if (!existing) {
    await emitSapargulEvent(ctx, "DELIVERY_CREATED", shipment.id, { publicId: shipment.publicId });
  }

  // --- BLOCK: never organize this delivery, ever. ---
  if (mergedRiskLevel === "BLOCKED") {
    if (canTransitionShipment(shipment.status, "CANCELLED")) {
      await transitionShipment(ctx, shipment.id, "CANCELLED", { cancelReason: mergedRiskReason ?? "risk_blocked" });
    }
    await openShipmentIncident(ctx, {
      shipmentId: shipment.id,
      type: "risk_blocked",
      severity: "CRITICAL",
      description: mergedRiskReason,
      openedByType: "AGENT",
    });
    await emitSapargulEvent(ctx, "DELIVERY_CANCELLED", shipment.id, { reason: "risk_blocked" });
    return {
      shipmentId: shipment.id,
      publicId: shipment.publicId,
      status: "CANCELLED",
      language: params.language,
      missingFields: [],
      risk: { level: "BLOCKED", action: "BLOCK", flags: mergedRiskFlags, reason: mergedRiskReason },
      recommendedQuote: null,
      assignedExecutorName: null,
      incidentOpened: true,
      paymentInstructions: null,
    };
  }

  // --- Missing required fields: ask, don't guess. ---
  if (missing.length > 0) {
    if (canTransitionShipment(shipment.status, "NEEDS_INFO")) {
      await transitionShipment(ctx, shipment.id, "NEEDS_INFO");
    }
    return {
      shipmentId: shipment.id,
      publicId: shipment.publicId,
      status: "NEEDS_INFO",
      language: params.language,
      missingFields: missing,
      risk: { level: mergedRiskLevel, action: mergedRiskLevel === "ELEVATED" ? "ESCALATE" : "ALLOW", flags: mergedRiskFlags, reason: mergedRiskReason },
      recommendedQuote: null,
      assignedExecutorName: null,
      incidentOpened: false,
      paymentInstructions: null,
    };
  }

  if (canTransitionShipment(shipment.status, "READY_FOR_MATCHING")) {
    await transitionShipment(ctx, shipment.id, "READY_FOR_MATCHING");
  }

  // --- ESCALATE: hold for manual review, never auto-confirm. ---
  if (mergedRiskLevel === "ELEVATED") {
    await openShipmentIncident(ctx, {
      shipmentId: shipment.id,
      type: mergedRiskFlags[0] ?? "risk_elevated",
      severity: mergedRiskFlags.some((f) => ["lithium_battery", "cash_valuables", "gas_pressure"].includes(f)) ? "HIGH" : "MEDIUM",
      description: mergedRiskReason,
      openedByType: "AGENT",
    });
    return {
      shipmentId: shipment.id,
      publicId: shipment.publicId,
      status: "READY_FOR_MATCHING",
      language: params.language,
      missingFields: [],
      risk: { level: "ELEVATED", action: "ESCALATE", flags: mergedRiskFlags, reason: mergedRiskReason },
      recommendedQuote: null,
      assignedExecutorName: null,
      incidentOpened: true,
      paymentInstructions: null,
    };
  }

  // --- LOW risk, all required fields known: search and rank, but STOP at
  // the customer confirmation gate. Finding/ranking the best option is never
  // the same as booking it (AGENTS hardening spec s.3/s.4/s.32) — no
  // ShipmentLeg is created and no executor is assigned here; that only
  // happens inside confirmShipmentQuote(), triggered by an explicit,
  // separate customer confirmation action. ---
  await transitionShipment(ctx, shipment.id, "SEARCHING");

  const requirements: ShipmentCargoRequirements = {
    weightKg: shipment.weightKg,
    pieces: shipment.pieces,
    fragile: shipment.fragile,
    perishable: shipment.perishable,
    temperatureControlled: shipment.temperatureControlled,
  };

  const provider = getSaparDeliveryProvider();
  const available = await provider.checkAvailability({
    weightKg: shipment.weightKg,
    pieces: shipment.pieces,
    serviceLevel: shipment.serviceLevel,
    doorToDoor: shipment.doorToDoor,
  });

  if (!available) {
    await transitionShipment(ctx, shipment.id, "FAILED", { cancelReason: "no_executor_available" });
    await openShipmentIncident(ctx, {
      shipmentId: shipment.id,
      type: "no_executor_available",
      severity: "MEDIUM",
      description: "Ни один провайдер/исполнитель не подтвердил доступность для этого направления.",
      openedByType: "AGENT",
    });
    return {
      shipmentId: shipment.id,
      publicId: shipment.publicId,
      status: "FAILED",
      language: params.language,
      missingFields: [],
      risk: { level: "LOW", action: "ALLOW", flags: mergedRiskFlags, reason: null },
      recommendedQuote: null,
      assignedExecutorName: null,
      incidentOpened: true,
      paymentInstructions: null,
    };
  }

  const { candidates } = await buildQuoteCandidates({
    weightKg: shipment.weightKg,
    pieces: shipment.pieces,
    serviceLevel: shipment.serviceLevel,
    doorToDoor: shipment.doorToDoor,
    pickupText: shipment.pickupText,
    destinationText: shipment.destinationText,
    requirements,
  });
  const ranked = rankQuoteCandidates(candidates);

  const persistedQuotes = await db.$transaction(
    ranked.map((c, i) =>
      db.shipmentQuote.create({
        data: {
          shipmentId: shipment.id,
          providerCode: c.providerCode,
          executorId: c.executorId,
          priceSom: c.priceSom,
          priceSource: c.priceSource,
          estimatedPickupAt: c.estimatedPickupAt,
          estimatedDeliveryAt: c.estimatedDeliveryAt,
          serviceType: c.serviceType,
          doorToDoor: c.doorToDoor,
          lastMileIncluded: c.lastMileIncluded,
          confidence: c.confidence,
          rankScore: c.rankScore,
          rankReasons: c.rankReasons,
          status: i === 0 ? "RECOMMENDED" : "OFFERED",
        },
      }),
    ),
  );
  const recommendedRow = persistedQuotes[0];

  await transitionShipment(ctx, shipment.id, "QUOTED");
  await db.shipment.update({ where: { id: shipment.id }, data: { selectedQuoteId: recommendedRow.id } });
  await transitionShipment(ctx, shipment.id, "AWAITING_CONFIRMATION");

  await logAgentAction({
    ctx,
    agent: "SAPAR",
    action: "sapar.request_completed",
    entityType: "Shipment",
    entityId: shipment.id,
    details: { status: "AWAITING_CONFIRMATION", quoteId: recommendedRow.id },
  });

  return {
    shipmentId: shipment.id,
    publicId: shipment.publicId,
    status: "AWAITING_CONFIRMATION",
    language: params.language,
    missingFields: [],
    risk: { level: "LOW", action: "ALLOW", flags: mergedRiskFlags, reason: null },
    recommendedQuote: {
      priceSom: recommendedRow.priceSom,
      priceSource: recommendedRow.priceSource,
      estimatedPickupAt: recommendedRow.estimatedPickupAt,
      estimatedDeliveryAt: recommendedRow.estimatedDeliveryAt,
      isMockPricing: isMockProviderCode(recommendedRow.providerCode),
    },
    assignedExecutorName: null,
    incidentOpened: false,
    paymentInstructions: null,
  };
}
