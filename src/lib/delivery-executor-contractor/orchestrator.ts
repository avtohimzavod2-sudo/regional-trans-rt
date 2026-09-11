// DELIVERY_EXECUTOR_CONTRACTOR — Contragent #3 (master spec s.5): finds and
// qualifies delivery executors (couriers, taxi drivers willing to carry
// parcels, light vans, local/intercity delivery executors) from permitted
// public sources. NOT Sapar: never accepts a customer shipment, assigns an
// order, confirms cargo safety, or handles money — its job ends the moment an
// interested prospect's ProspectHandoff is ACCEPTED by SAPAR/
// DELIVERY_OPERATIONS (src/lib/prospecting/handoff.ts), the shared Core every
// acquisition contragent hands off through.
import type { Channel, DeliveryExecutorProspect } from "@prisma/client";
import { normalizePhone } from "@/lib/agents/scout";
import type { AgentContext, AgentContract } from "@/lib/agents/types";
import { logAgentAction } from "@/lib/agents/trace";
import { classifyMarketRole, isActionableClassification } from "@/lib/acquisition/role-classifier";
import { sendAcquisitionOutreach } from "@/lib/acquisition/outreach-log";
import { computeContactFingerprint } from "@/lib/prospecting/identity";
import { createProspectHandoff, type CreateProspectHandoffResult } from "@/lib/prospecting/handoff";
import { ProspectLifecycleNotFoundError, type LifecycleTransitionResult } from "@/lib/prospecting/lifecycle";
import { sendProspectFollowUp, type FollowUpOutcome } from "@/lib/acquisition/follow-up";
import {
  canTransitionDeliveryExecutorProspect,
  captureDeliveryExecutorQualificationFacts,
  createDeliveryExecutorProspect,
  findExistingDeliveryExecutorProspect,
  findPossibleDuplicateDeliveryExecutorProspect,
  flagDeliveryExecutorPossibleDuplicate,
  getDeliveryExecutorProspect,
  recordDeliveryExecutorFollowUpCounters,
  transitionDeliveryExecutorLifecycleStage,
  transitionDeliveryExecutorProspectStatus,
} from "./prospect";
import type { DeliveryExecutorContractorOutcome, DeliveryExecutorHandoffOutcome, DeliveryExecutorQualificationFacts, DeliveryExecutorSightingInput } from "./types";

export const DELIVERY_EXECUTOR_CONTRACTOR_AGENT_CONTRACT: AgentContract = {
  name: "DELIVERY_EXECUTOR_CONTRACTOR",
  mission:
    "Find and qualify delivery-executor supply (couriers, taxi drivers willing to carry parcels, light vans, local/intercity delivery executors) from permitted public sources, and hand off an interested, qualified prospect to SAPAR/DELIVERY_OPERATIONS through the shared Prospecting Core — never operate a delivery itself.",
  inputs: ["raw sighting text + source (permitted channels only)", "dispatcher-triggered lifecycle decisions (qualify / decline / handoff)"],
  outputs: ["DeliveryExecutorProspect rows (its own exclusive model)", "AcquisitionOutreachEvent rows for delivery-executor prospects", "ProspectHandoff rows via the shared Prospecting Core"],
  permissions: [
    "create/update DeliveryExecutorProspect (its own exclusive write surface)",
    "create AcquisitionOutreachEvent (shared outreach ledger, prospectType DELIVERY_EXECUTOR)",
    "create ProspectHandoff via createProspectHandoff (shared Prospecting Core, never a bespoke handoff)",
    "write AuditLogEntry (agent: DELIVERY_EXECUTOR_CONTRACTOR)",
  ],
  prohibitedActions: [
    "never accept a customer shipment, assign an order, confirm cargo safety, or change delivery operational status — those stay SAPAR's/DELIVERY_OPERATIONS' exclusive capabilities",
    "never write ScoutCandidate or Driver directly — those stay DRIVER_CONTRACTOR's/SCOUT's exclusive models",
    "never handle or confirm payment",
    "never invent a phone/handle/vehicle/zone signal that isn't present in the source text",
    "never message a prospect as Mira or claim to be Mira",
    "never send outreach outside sendAcquisitionOutreach's safety gate",
    "never create a ProspectHandoff outside the approved HANDOFF_TARGETS list for DELIVERY_EXECUTOR_SUPPLY",
    "never force an illegal DeliveryExecutorProspect lifecycle transition",
    "never keep owning the operational relationship once a handoff is ACCEPTED",
  ],
  kpi: ["delivery-executor prospects reaching a handed-off, accepted state", "% of sightings correctly classified as DELIVERY_EXECUTOR vs DRIVER/CARGO_CARRIER"],
  escalationRules: ["a sighting classified below MIN_ACTIONABLE_CONFIDENCE, or not role DELIVERY_EXECUTOR, is never turned into a prospect", "an illegal lifecycle transition is rejected rather than forced"],
  reportsTo: "ARTUR",
  canRead: ["delivery_executor_prospect", "acquisition_outreach_event"],
  canExecute: ["delivery_executor_contractor.process_sighting", "delivery_executor_contractor.qualify", "delivery_executor_contractor.handoff_to_operations"],
  ownsExclusiveCapabilities: ["delivery_executor_prospect_write"],
  forbiddenCapabilities: [
    "external_customer_communication",
    "confirm_cargo_payment",
    "central_treasury_transaction_record",
    "delivery_crm_event_write",
    "drive_crm_event_write",
    "driver_acquisition_outreach",
    "passenger_prospect_write",
    "business_prospect_write",
    "cargo_operational_status",
    "assign_cargo_delivery_executor",
    "complaint_arbitration_decision",
    "disciplinary_sanction",
    "director_daily_brief",
  ],
  escalationTarget: "ARTUR",
  criticalityLevel: "LOW",
  active: true,
};

function buildDeliveryExecutorOutreachMessage(): string {
  return [
    "Салам! Биз RT — облустар аралык жеткирүү платформасы. Курьерлик/жеткирүү кызматыңыз үчүн туруктуу заказдарды сунуштайбыз.",
    "Здравствуйте! Мы RT — платформа межгородской доставки. Хотели бы предложить стабильные заказы для вашей курьерской/доставочной деятельности.",
    "Кызыксаңыз, RT ботуна жазыңыз / Если интересно — напишите нашему боту.",
  ].join(" ");
}

function resolvableOutreachChannel(input: DeliveryExecutorSightingInput): { channel: "WHATSAPP"; to: string } | null {
  const phone = normalizePhone(input.rawPhone);
  return phone ? { channel: "WHATSAPP", to: phone } : null;
}

/** Classifies one raw sighting, tracks it in DeliveryExecutorProspect
 * (deduped against any prospect we already know), and — when a real contact
 * channel exists — sends one rate-limited, do-not-contact-respecting (both
 * per-prospect and cross-type-fingerprint) outreach message. */
export async function processDeliveryExecutorMarketSighting(ctx: AgentContext, input: DeliveryExecutorSightingInput): Promise<DeliveryExecutorContractorOutcome> {
  const classification = await classifyMarketRole(input.sourceText);

  if (!isActionableClassification(classification) || classification.role !== "DELIVERY_EXECUTOR") {
    return { outcome: "SKIPPED_NOT_A_DELIVERY_EXECUTOR_SIGHTING", classification };
  }

  const existing = await findExistingDeliveryExecutorProspect(input);
  if (existing) {
    return { outcome: "ALREADY_KNOWN", prospect: existing };
  }

  const prospect = await createDeliveryExecutorProspect(input);

  await logAgentAction({
    ctx,
    agent: "DELIVERY_EXECUTOR_CONTRACTOR",
    action: "delivery_executor_contractor.prospect_created",
    entityType: "DeliveryExecutorProspect",
    entityId: prospect.id,
    details: { confidence: classification.confidence, sourceType: input.sourceType },
  });

  const outreach = await maybeSendDeliveryExecutorOutreach(prospect.id, input);

  return { outcome: "PROSPECT_CREATED", prospect, classification, outreach };
}

async function maybeSendDeliveryExecutorOutreach(prospectId: string, input: DeliveryExecutorSightingInput) {
  const target = resolvableOutreachChannel(input);
  if (!target) return null;

  const fingerprint = computeContactFingerprint({ phone: input.rawPhone, telegramUsername: input.rawTelegramUsername });

  const outreach = await sendAcquisitionOutreach({
    contractorAgent: "DELIVERY_EXECUTOR_CONTRACTOR",
    prospectType: "DELIVERY_EXECUTOR",
    prospectRef: prospectId,
    channel: target.channel,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    to: target.to,
    text: buildDeliveryExecutorOutreachMessage(),
    idempotencyKey: `delivery-executor-contractor:${prospectId}:acquisition-outreach`,
    contactFingerprint: fingerprint,
  });

  if (outreach.status === "SENT" || outreach.status === "DRY_RUN" || outreach.status === "SANDBOX") {
    await transitionDeliveryExecutorProspectStatus(prospectId, "CONTACTED");
  }

  return outreach;
}

/** Dispatcher-triggered, deterministic lifecycle transition: a CONTACTED
 * prospect that has demonstrated real interest becomes QUALIFIED. Rejects an
 * illegal jump rather than forcing it. */
export async function qualifyDeliveryExecutorProspect(
  ctx: AgentContext,
  prospectId: string,
  current: { status: Parameters<typeof canTransitionDeliveryExecutorProspect>[0] },
) {
  if (!canTransitionDeliveryExecutorProspect(current.status, "QUALIFIED")) {
    throw new Error(`Delivery Executor Contractor rejected transition: cannot move a ${current.status} prospect to QUALIFIED`);
  }
  const prospect = await transitionDeliveryExecutorProspectStatus(prospectId, "QUALIFIED");
  await logAgentAction({ ctx, agent: "DELIVERY_EXECUTOR_CONTRACTOR", action: "delivery_executor_contractor.qualified", entityType: "DeliveryExecutorProspect", entityId: prospectId });
  return prospect;
}

/** Hands an interested, qualified prospect off to SAPAR/DELIVERY_OPERATIONS
 * through the shared Prospecting Core — never a bespoke handoff mechanism,
 * never a direct write into any operational model. Creating the
 * ProspectHandoff never itself implies acceptance; ownership only transfers
 * once the target department calls acceptProspectHandoff. */
export async function handoffDeliveryExecutorProspect(
  ctx: AgentContext,
  prospectId: string,
  current: { status: Parameters<typeof canTransitionDeliveryExecutorProspect>[0]; rawPhone: string | null; rawTelegramUsername: string | null; rawVehicleText: string | null; rawZonesText: string | null },
  targetAgentOrDepartment: "SAPAR" | "DELIVERY_OPERATIONS",
): Promise<DeliveryExecutorHandoffOutcome> {
  // A prospect already HANDED_OFF is a legal retry/replay (spec s.13:
  // "repeated serverless invocation") — resolved as an idempotent no-op by
  // createProspectHandoff's own idempotencyKey dedup below, never re-thrown.
  if (current.status !== "HANDED_OFF" && !canTransitionDeliveryExecutorProspect(current.status, "HANDED_OFF")) {
    throw new Error(`Delivery Executor Contractor rejected transition: cannot hand off a ${current.status} prospect`);
  }

  const fingerprint = computeContactFingerprint({ phone: current.rawPhone, telegramUsername: current.rawTelegramUsername });

  const { handoff, deduplicated } = await createProspectHandoff(ctx, {
    prospectType: "DELIVERY_EXECUTOR_SUPPLY",
    prospectRef: prospectId,
    sourceAgent: "DELIVERY_EXECUTOR_CONTRACTOR",
    targetAgentOrDepartment,
    expressedInterest: "yes",
    contactData: current.rawPhone ?? current.rawTelegramUsername ?? "UNKNOWN",
    requestedService: current.rawVehicleText ?? "UNKNOWN",
    availableCapabilities: current.rawZonesText ? [current.rawZonesText] : [],
    contactFingerprint: fingerprint,
    idempotencyKey: `delivery-executor-contractor:${prospectId}:handoff:${targetAgentOrDepartment}`,
  });

  const prospect = await transitionDeliveryExecutorProspectStatus(prospectId, "HANDED_OFF");
  return { handoff, deduplicated, prospect };
}

// --- Task D: additive ProspectLifecycleStage layer -------------------------
// Everything below drives the richer 11-state lifecycleStage pipeline (spec
// A) as an independent dimension layered on top of everything above, which
// is left completely unmodified. A dispatcher may drive a prospect through
// either dimension, both, or neither — this module never assumes the other
// dimension has been touched.

/** DISCOVERED -> QUALIFICATION_PENDING: the dispatcher has started looking
 * into a fresh sighting. */
export async function beginDeliveryExecutorQualification(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<DeliveryExecutorProspect>> {
  const result = await transitionDeliveryExecutorLifecycleStage(prospectId, "QUALIFICATION_PENDING");
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "DELIVERY_EXECUTOR_CONTRACTOR", action: "delivery_executor_contractor.qualification_started", entityType: "DeliveryExecutorProspect", entityId: prospectId });
  }
  return result;
}

/** Captures qualification facts (first-write-wins, spec A/D) and, whenever a
 * person/company name becomes known, checks for a possible duplicate by that
 * name against every OTHER prospect — flagging, never merging (spec E). */
export async function submitDeliveryExecutorQualification(
  ctx: AgentContext,
  prospectId: string,
  facts: DeliveryExecutorQualificationFacts,
): Promise<DeliveryExecutorProspect> {
  const prospect = await captureDeliveryExecutorQualificationFacts(prospectId, facts);

  if (prospect.personOrCompanyName && !prospect.possibleDuplicateOfId) {
    const possibleDuplicate = await findPossibleDuplicateDeliveryExecutorProspect(prospect.personOrCompanyName, prospectId);
    if (possibleDuplicate) {
      const flagged = await flagDeliveryExecutorPossibleDuplicate(prospectId, possibleDuplicate.id);
      await logAgentAction({
        ctx,
        agent: "DELIVERY_EXECUTOR_CONTRACTOR",
        action: "delivery_executor_contractor.possible_duplicate_flagged",
        entityType: "DeliveryExecutorProspect",
        entityId: prospectId,
        details: { possibleDuplicateOfId: possibleDuplicate.id },
      });
      return flagged;
    }
  }

  return prospect;
}

/** QUALIFICATION_PENDING -> QUALIFIED. */
export async function qualifyDeliveryExecutorLead(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<DeliveryExecutorProspect>> {
  const result = await transitionDeliveryExecutorLifecycleStage(prospectId, "QUALIFIED");
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "DELIVERY_EXECUTOR_CONTRACTOR", action: "delivery_executor_contractor.lead_qualified", entityType: "DeliveryExecutorProspect", entityId: prospectId });
  }
  return result;
}

/** QUALIFICATION_PENDING/CONTACTED/FOLLOW_UP_PENDING -> REJECTED. Reason is
 * always recorded — spec A: "rejection reason where applicable". */
export async function rejectDeliveryExecutorLead(ctx: AgentContext, prospectId: string, rejectionReason: string): Promise<LifecycleTransitionResult<DeliveryExecutorProspect>> {
  const result = await transitionDeliveryExecutorLifecycleStage(prospectId, "REJECTED", { rejectionReason });
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "DELIVERY_EXECUTOR_CONTRACTOR", action: "delivery_executor_contractor.lead_rejected", entityType: "DeliveryExecutorProspect", entityId: prospectId, details: { rejectionReason } });
  }
  return result;
}

/** QUALIFIED -> CONTACT_PENDING -> CONTACTED (spec A minimum pipeline). */
export async function moveDeliveryExecutorToContactPending(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<DeliveryExecutorProspect>> {
  return transitionDeliveryExecutorLifecycleStage(prospectId, "CONTACT_PENDING");
}

export async function markDeliveryExecutorContacted(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<DeliveryExecutorProspect>> {
  const result = await transitionDeliveryExecutorLifecycleStage(prospectId, "CONTACTED");
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "DELIVERY_EXECUTOR_CONTRACTOR", action: "delivery_executor_contractor.lead_contacted", entityType: "DeliveryExecutorProspect", entityId: prospectId });
  }
  return result;
}

export interface DeliveryExecutorFollowUpParams {
  channel: Channel;
  sourceType: DeliveryExecutorSightingInput["sourceType"];
  sourceRef?: string | null;
  to: string;
  text: string;
  contactFingerprint?: string | null;
}

/** Bounded, retry-safe, stoppable follow-up (spec F) — delegates every stop
 * condition (already responded, terminal stage, MAX_FOLLOW_UP_ATTEMPTS) to
 * the shared src/lib/acquisition/follow-up.ts module rather than
 * reimplementing the bound here. CONTACTED -> FOLLOW_UP_PENDING advances on
 * the first real attempt; a second/third attempt is a no-op transition
 * (already FOLLOW_UP_PENDING). */
export async function followUpWithDeliveryExecutorProspect(
  ctx: AgentContext,
  prospectId: string,
  params: DeliveryExecutorFollowUpParams,
): Promise<{ prospect: DeliveryExecutorProspect; outcome: FollowUpOutcome }> {
  const prospect = await getDeliveryExecutorProspect(prospectId);
  if (!prospect) throw new ProspectLifecycleNotFoundError(prospectId);

  const hasResponded = prospect.respondedAt != null;
  const isTerminal = prospect.lifecycleStage !== "CONTACTED" && prospect.lifecycleStage !== "FOLLOW_UP_PENDING";

  const outcome = await sendProspectFollowUp(ctx, {
    contractorAgent: "DELIVERY_EXECUTOR_CONTRACTOR",
    prospectType: "DELIVERY_EXECUTOR",
    prospectRef: prospectId,
    channel: params.channel,
    sourceType: params.sourceType,
    sourceRef: params.sourceRef,
    to: params.to,
    text: params.text,
    contactFingerprint: params.contactFingerprint,
    idempotencyKey: `delivery-executor-contractor:${prospectId}:follow-up:${prospect.followUpCount + 1}`,
    hasResponded,
    isTerminal,
  });

  if (outcome.skippedReason) {
    return { prospect, outcome };
  }

  await transitionDeliveryExecutorLifecycleStage(prospectId, "FOLLOW_UP_PENDING");
  const updated = await recordDeliveryExecutorFollowUpCounters(prospectId, outcome.attemptNumber);

  return { prospect: updated, outcome };
}

/** CONTACTED/FOLLOW_UP_PENDING -> RESPONDED. Stamps respondedAt, which
 * followUpWithDeliveryExecutorProspect / sendProspectFollowUp treat as an
 * immediate, permanent stop condition for further follow-up. */
export async function recordDeliveryExecutorResponse(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<DeliveryExecutorProspect>> {
  const result = await transitionDeliveryExecutorLifecycleStage(prospectId, "RESPONDED", { respondedAt: new Date() });
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "DELIVERY_EXECUTOR_CONTRACTOR", action: "delivery_executor_contractor.lead_responded", entityType: "DeliveryExecutorProspect", entityId: prospectId });
  }
  return result;
}

/** RESPONDED -> HANDOFF_READY. */
export async function markDeliveryExecutorHandoffReady(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<DeliveryExecutorProspect>> {
  const result = await transitionDeliveryExecutorLifecycleStage(prospectId, "HANDOFF_READY");
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "DELIVERY_EXECUTOR_CONTRACTOR", action: "delivery_executor_contractor.handoff_ready", entityType: "DeliveryExecutorProspect", entityId: prospectId });
  }
  return result;
}

export interface CompleteDeliveryExecutorHandoffResult {
  prospect: DeliveryExecutorProspect;
  deduplicated: boolean;
  handoff: CreateProspectHandoffResult["handoff"];
  handoffDeduplicated: boolean;
}

/** HANDOFF_READY -> HANDED_OFF, alongside the same structured ProspectHandoff
 * contract every contragent uses (spec G) — only verified/known facts plus
 * provenance/confidence, never operational authority. Both the ProspectHandoff
 * creation (idempotencyKey) and the lifecycleStage transition (CAS) are
 * independently duplicate-safe, so calling this twice for the same prospect
 * is a safe no-op (spec: duplicate handoff prevention). */
export async function completeDeliveryExecutorHandoff(
  ctx: AgentContext,
  prospectId: string,
  targetAgentOrDepartment: "SAPAR" | "DELIVERY_OPERATIONS",
): Promise<CompleteDeliveryExecutorHandoffResult> {
  const prospect = await getDeliveryExecutorProspect(prospectId);
  if (!prospect) throw new ProspectLifecycleNotFoundError(prospectId);

  const fingerprint = computeContactFingerprint({ phone: prospect.rawPhone, telegramUsername: prospect.rawTelegramUsername });

  const { handoff, deduplicated: handoffDeduplicated } = await createProspectHandoff(ctx, {
    prospectType: "DELIVERY_EXECUTOR_SUPPLY",
    prospectRef: prospectId,
    sourceAgent: "DELIVERY_EXECUTOR_CONTRACTOR",
    targetAgentOrDepartment,
    expressedInterest: "yes",
    contactData: prospect.rawPhone ?? prospect.rawTelegramUsername ?? "UNKNOWN",
    requestedService: prospect.executorType ?? prospect.rawVehicleText ?? "UNKNOWN",
    availableCapabilities: [prospect.serviceAreaText, prospect.rawZonesText].filter((v): v is string => !!v),
    contactFingerprint: fingerprint,
    idempotencyKey: `delivery-executor-contractor:${prospectId}:lifecycle-handoff:${targetAgentOrDepartment}`,
  });

  const { prospect: updated, deduplicated } = await transitionDeliveryExecutorLifecycleStage(prospectId, "HANDED_OFF");

  if (!deduplicated) {
    await logAgentAction({
      ctx,
      agent: "DELIVERY_EXECUTOR_CONTRACTOR",
      action: "delivery_executor_contractor.lifecycle_handed_off",
      entityType: "DeliveryExecutorProspect",
      entityId: prospectId,
      details: { targetAgentOrDepartment, handoffId: handoff.id },
    });
  }

  return { prospect: updated, deduplicated, handoff, handoffDeduplicated };
}
