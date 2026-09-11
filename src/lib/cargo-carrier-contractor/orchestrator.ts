// CARGO_CARRIER_CONTRACTOR — Contragent #4 (master spec s.6): finds and
// qualifies freight transport supply (cargo vans, trucks, refrigerated
// vehicles, fleet operators) from permitted public sources, captures their
// claimed capabilities, and hands an interested prospect off to
// CARGO_OPERATIONS — a namespace/department string, never a new named agent
// this module invents. NOT Cargo Operations itself: never matches loads,
// never confirms a real TransportAsset fact, never handles money.
import type { CargoCarrierProspect, Channel } from "@prisma/client";
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
  canTransitionCargoCarrierProspect,
  captureCargoCarrierQualificationFacts,
  createCargoCarrierProspect,
  findExistingCargoCarrierProspect,
  findPossibleDuplicateCargoCarrierProspect,
  flagCargoCarrierPossibleDuplicate,
  getCargoCarrierProspect,
  recordCargoCarrierFollowUpCounters,
  transitionCargoCarrierLifecycleStage,
  transitionCargoCarrierProspectStatus,
} from "./prospect";
import type { CargoCarrierContractorOutcome, CargoCarrierHandoffOutcome, CargoCarrierQualificationFacts, CargoCarrierSightingInput } from "./types";

export const CARGO_CARRIER_CONTRACTOR_AGENT_CONTRACT: AgentContract = {
  name: "CARGO_CARRIER_CONTRACTOR",
  mission:
    "Find and qualify freight transport supply (cargo vans, trucks, refrigerated vehicles, fleet operators) from permitted public sources, capture their claimed capabilities as unverified prospect data, and hand off an interested, qualified prospect to CARGO_OPERATIONS through the shared Prospecting Core — never operate freight matching or transport itself.",
  inputs: ["raw sighting text + source (permitted channels only)", "dispatcher-triggered lifecycle decisions (qualify / decline / handoff)"],
  outputs: ["CargoCarrierProspect rows (its own exclusive model)", "AcquisitionOutreachEvent rows for cargo-carrier prospects", "ProspectHandoff rows via the shared Prospecting Core"],
  permissions: [
    "create/update CargoCarrierProspect (its own exclusive write surface)",
    "create AcquisitionOutreachEvent (shared outreach ledger, prospectType CARGO_CARRIER)",
    "create ProspectHandoff via createProspectHandoff (shared Prospecting Core, never a bespoke handoff)",
    "write AuditLogEntry (agent: CARGO_CARRIER_CONTRACTOR)",
  ],
  prohibitedActions: [
    "never become Cargo Operations — never match loads, never assign a shipment, never confirm cargo safety, never change any operational status",
    "never auto-convert a prospect's claimed vehicle class/capacity/temperature capability/route/backhaul interest into a trusted PartnerRegistry TransportAsset fact — those require normal onboarding/verification",
    "never write ScoutCandidate, Driver, or DeliveryExecutorProspect directly — each contragent's model stays its own",
    "never handle or confirm payment",
    "never invent a capability/phone/handle signal that isn't present in the source text",
    "never message a prospect as Mira or claim to be Mira",
    "never send outreach outside sendAcquisitionOutreach's safety gate",
    "never create a ProspectHandoff outside the approved HANDOFF_TARGETS list for CARGO_CARRIER_SUPPLY",
    "never force an illegal CargoCarrierProspect lifecycle transition",
    "never keep owning the operational relationship once a handoff is ACCEPTED",
  ],
  kpi: ["cargo-carrier prospects reaching a handed-off, accepted state", "% of sightings correctly classified as CARGO_CARRIER vs DRIVER/DELIVERY_EXECUTOR"],
  escalationRules: ["a sighting classified below MIN_ACTIONABLE_CONFIDENCE, or not role CARGO_CARRIER, is never turned into a prospect", "an illegal lifecycle transition is rejected rather than forced"],
  reportsTo: "ARTUR",
  canRead: ["cargo_carrier_prospect", "acquisition_outreach_event"],
  canExecute: ["cargo_carrier_contractor.process_sighting", "cargo_carrier_contractor.qualify", "cargo_carrier_contractor.handoff_to_operations"],
  ownsExclusiveCapabilities: ["cargo_carrier_prospect_write"],
  forbiddenCapabilities: [
    "external_customer_communication",
    "confirm_cargo_payment",
    "central_treasury_transaction_record",
    "delivery_crm_event_write",
    "drive_crm_event_write",
    "driver_acquisition_outreach",
    "passenger_prospect_write",
    "business_prospect_write",
    "delivery_executor_prospect_write",
    "cargo_operational_status",
    "assign_cargo_delivery_executor",
    "transport_asset_write",
    "complaint_arbitration_decision",
    "disciplinary_sanction",
    "director_daily_brief",
  ],
  escalationTarget: "ARTUR",
  criticalityLevel: "LOW",
  active: true,
};

function buildCargoCarrierOutreachMessage(): string {
  return [
    "Салам! Биз RT — облустар аралык жүк ташуу платформасы. Сиздин унааңыз үчүн туруктуу жүктөрдү сунуштайбыз.",
    "Здравствуйте! Мы RT — платформа межгородских грузоперевозок. Хотели бы предложить стабильные загрузки для вашего транспорта.",
    "Кызыксаңыз, RT ботуна жазыңыз / Если интересно — напишите нашему боту.",
  ].join(" ");
}

function resolvableOutreachChannel(input: CargoCarrierSightingInput): { channel: "WHATSAPP"; to: string } | null {
  const phone = normalizePhone(input.rawPhone);
  return phone ? { channel: "WHATSAPP", to: phone } : null;
}

/** Classifies one raw sighting, tracks it in CargoCarrierProspect (deduped
 * against any prospect we already know), and — when a real contact channel
 * exists — sends one rate-limited, do-not-contact-respecting (both
 * per-prospect and cross-type-fingerprint) outreach message. */
export async function processCargoCarrierMarketSighting(ctx: AgentContext, input: CargoCarrierSightingInput): Promise<CargoCarrierContractorOutcome> {
  const classification = await classifyMarketRole(input.sourceText);

  if (!isActionableClassification(classification) || classification.role !== "CARGO_CARRIER") {
    return { outcome: "SKIPPED_NOT_A_CARGO_CARRIER_SIGHTING", classification };
  }

  const existing = await findExistingCargoCarrierProspect(input);
  if (existing) {
    return { outcome: "ALREADY_KNOWN", prospect: existing };
  }

  const prospect = await createCargoCarrierProspect(input);

  await logAgentAction({
    ctx,
    agent: "CARGO_CARRIER_CONTRACTOR",
    action: "cargo_carrier_contractor.prospect_created",
    entityType: "CargoCarrierProspect",
    entityId: prospect.id,
    details: { confidence: classification.confidence, sourceType: input.sourceType },
  });

  const outreach = await maybeSendCargoCarrierOutreach(prospect.id, input);

  return { outcome: "PROSPECT_CREATED", prospect, classification, outreach };
}

async function maybeSendCargoCarrierOutreach(prospectId: string, input: CargoCarrierSightingInput) {
  const target = resolvableOutreachChannel(input);
  if (!target) return null;

  const fingerprint = computeContactFingerprint({ phone: input.rawPhone, telegramUsername: input.rawTelegramUsername });

  const outreach = await sendAcquisitionOutreach({
    contractorAgent: "CARGO_CARRIER_CONTRACTOR",
    prospectType: "CARGO_CARRIER",
    prospectRef: prospectId,
    channel: target.channel,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    to: target.to,
    text: buildCargoCarrierOutreachMessage(),
    idempotencyKey: `cargo-carrier-contractor:${prospectId}:acquisition-outreach`,
    contactFingerprint: fingerprint,
  });

  if (outreach.status === "SENT" || outreach.status === "DRY_RUN" || outreach.status === "SANDBOX") {
    await transitionCargoCarrierProspectStatus(prospectId, "CONTACTED");
  }

  return outreach;
}

/** Dispatcher-triggered, deterministic lifecycle transition: a CONTACTED
 * prospect that has demonstrated real interest becomes QUALIFIED. Rejects an
 * illegal jump rather than forcing it. */
export async function qualifyCargoCarrierProspect(
  ctx: AgentContext,
  prospectId: string,
  current: { status: Parameters<typeof canTransitionCargoCarrierProspect>[0] },
) {
  if (!canTransitionCargoCarrierProspect(current.status, "QUALIFIED")) {
    throw new Error(`Cargo Carrier Contractor rejected transition: cannot move a ${current.status} prospect to QUALIFIED`);
  }
  const prospect = await transitionCargoCarrierProspectStatus(prospectId, "QUALIFIED");
  await logAgentAction({ ctx, agent: "CARGO_CARRIER_CONTRACTOR", action: "cargo_carrier_contractor.qualified", entityType: "CargoCarrierProspect", entityId: prospectId });
  return prospect;
}

/** Hands an interested, qualified prospect off to CARGO_OPERATIONS through
 * the shared Prospecting Core — never a bespoke handoff mechanism, never a
 * direct write into PartnerRegistry/TransportAsset. The prospect's claimed
 * capabilities travel as free-text availableCapabilities entries only —
 * still unverified claims on the far side of the handoff, never facts this
 * module asserts as true. */
export async function handoffCargoCarrierProspect(
  ctx: AgentContext,
  prospectId: string,
  current: {
    status: Parameters<typeof canTransitionCargoCarrierProspect>[0];
    rawPhone: string | null;
    rawTelegramUsername: string | null;
    rawVehicleText: string | null;
    rawCapacityText: string | null;
    rawRouteText: string | null;
    rawTemperatureCapability: boolean | null;
    rawBackhaulText: string | null;
  },
): Promise<CargoCarrierHandoffOutcome> {
  // A prospect already HANDED_OFF is a legal retry/replay (spec s.13:
  // "repeated serverless invocation") — resolved as an idempotent no-op by
  // createProspectHandoff's own idempotencyKey dedup below, never re-thrown.
  if (current.status !== "HANDED_OFF" && !canTransitionCargoCarrierProspect(current.status, "HANDED_OFF")) {
    throw new Error(`Cargo Carrier Contractor rejected transition: cannot hand off a ${current.status} prospect`);
  }

  const fingerprint = computeContactFingerprint({ phone: current.rawPhone, telegramUsername: current.rawTelegramUsername });

  const availableCapabilities: string[] = [];
  if (current.rawCapacityText) availableCapabilities.push(`capacity: ${current.rawCapacityText}`);
  if (current.rawRouteText) availableCapabilities.push(`route: ${current.rawRouteText}`);
  if (current.rawTemperatureCapability) availableCapabilities.push("temperature-controlled");
  if (current.rawBackhaulText) availableCapabilities.push(`backhaul: ${current.rawBackhaulText}`);

  const { handoff, deduplicated } = await createProspectHandoff(ctx, {
    prospectType: "CARGO_CARRIER_SUPPLY",
    prospectRef: prospectId,
    sourceAgent: "CARGO_CARRIER_CONTRACTOR",
    targetAgentOrDepartment: "CARGO_OPERATIONS",
    expressedInterest: "yes",
    contactData: current.rawPhone ?? current.rawTelegramUsername ?? "UNKNOWN",
    requestedService: current.rawVehicleText ?? "UNKNOWN",
    availableCapabilities,
    contactFingerprint: fingerprint,
    idempotencyKey: `cargo-carrier-contractor:${prospectId}:handoff:CARGO_OPERATIONS`,
  });

  const prospect = await transitionCargoCarrierProspectStatus(prospectId, "HANDED_OFF");
  return { handoff, deduplicated, prospect };
}

// --- Task D: additive ProspectLifecycleStage layer -------------------------
// Everything below drives the richer 11-state lifecycleStage pipeline (spec
// B) as an independent dimension layered on top of everything above, which
// is left completely unmodified. A dispatcher may drive a prospect through
// either dimension, both, or neither — this module never assumes the other
// dimension has been touched.

/** DISCOVERED -> QUALIFICATION_PENDING: the dispatcher has started looking
 * into a fresh sighting. */
export async function beginCargoCarrierQualification(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<CargoCarrierProspect>> {
  const result = await transitionCargoCarrierLifecycleStage(prospectId, "QUALIFICATION_PENDING");
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "CARGO_CARRIER_CONTRACTOR", action: "cargo_carrier_contractor.qualification_started", entityType: "CargoCarrierProspect", entityId: prospectId });
  }
  return result;
}

/** Captures qualification facts (first-write-wins, spec B/D) and, whenever a
 * carrier identity name becomes known, checks for a possible duplicate by
 * that name against every OTHER prospect — flagging, never merging (spec E). */
export async function submitCargoCarrierQualification(
  ctx: AgentContext,
  prospectId: string,
  facts: CargoCarrierQualificationFacts,
): Promise<CargoCarrierProspect> {
  const prospect = await captureCargoCarrierQualificationFacts(prospectId, facts);

  if (prospect.carrierIdentityName && !prospect.possibleDuplicateOfId) {
    const possibleDuplicate = await findPossibleDuplicateCargoCarrierProspect(prospect.carrierIdentityName, prospectId);
    if (possibleDuplicate) {
      const flagged = await flagCargoCarrierPossibleDuplicate(prospectId, possibleDuplicate.id);
      await logAgentAction({
        ctx,
        agent: "CARGO_CARRIER_CONTRACTOR",
        action: "cargo_carrier_contractor.possible_duplicate_flagged",
        entityType: "CargoCarrierProspect",
        entityId: prospectId,
        details: { possibleDuplicateOfId: possibleDuplicate.id },
      });
      return flagged;
    }
  }

  return prospect;
}

/** QUALIFICATION_PENDING -> QUALIFIED. */
export async function qualifyCargoCarrierLead(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<CargoCarrierProspect>> {
  const result = await transitionCargoCarrierLifecycleStage(prospectId, "QUALIFIED");
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "CARGO_CARRIER_CONTRACTOR", action: "cargo_carrier_contractor.lead_qualified", entityType: "CargoCarrierProspect", entityId: prospectId });
  }
  return result;
}

/** QUALIFICATION_PENDING/CONTACTED/FOLLOW_UP_PENDING -> REJECTED. Reason is
 * always recorded — spec B: "rejection reason where applicable". */
export async function rejectCargoCarrierLead(ctx: AgentContext, prospectId: string, rejectionReason: string): Promise<LifecycleTransitionResult<CargoCarrierProspect>> {
  const result = await transitionCargoCarrierLifecycleStage(prospectId, "REJECTED", { rejectionReason });
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "CARGO_CARRIER_CONTRACTOR", action: "cargo_carrier_contractor.lead_rejected", entityType: "CargoCarrierProspect", entityId: prospectId, details: { rejectionReason } });
  }
  return result;
}

/** QUALIFIED -> CONTACT_PENDING -> CONTACTED (spec B minimum pipeline). */
export async function moveCargoCarrierToContactPending(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<CargoCarrierProspect>> {
  return transitionCargoCarrierLifecycleStage(prospectId, "CONTACT_PENDING");
}

export async function markCargoCarrierContacted(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<CargoCarrierProspect>> {
  const result = await transitionCargoCarrierLifecycleStage(prospectId, "CONTACTED");
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "CARGO_CARRIER_CONTRACTOR", action: "cargo_carrier_contractor.lead_contacted", entityType: "CargoCarrierProspect", entityId: prospectId });
  }
  return result;
}

export interface CargoCarrierFollowUpParams {
  channel: Channel;
  sourceType: CargoCarrierSightingInput["sourceType"];
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
export async function followUpWithCargoCarrierProspect(
  ctx: AgentContext,
  prospectId: string,
  params: CargoCarrierFollowUpParams,
): Promise<{ prospect: CargoCarrierProspect; outcome: FollowUpOutcome }> {
  const prospect = await getCargoCarrierProspect(prospectId);
  if (!prospect) throw new ProspectLifecycleNotFoundError(prospectId);

  const hasResponded = prospect.respondedAt != null;
  const isTerminal = prospect.lifecycleStage !== "CONTACTED" && prospect.lifecycleStage !== "FOLLOW_UP_PENDING";

  const outcome = await sendProspectFollowUp(ctx, {
    contractorAgent: "CARGO_CARRIER_CONTRACTOR",
    prospectType: "CARGO_CARRIER",
    prospectRef: prospectId,
    channel: params.channel,
    sourceType: params.sourceType,
    sourceRef: params.sourceRef,
    to: params.to,
    text: params.text,
    contactFingerprint: params.contactFingerprint,
    idempotencyKey: `cargo-carrier-contractor:${prospectId}:follow-up:${prospect.followUpCount + 1}`,
    hasResponded,
    isTerminal,
  });

  if (outcome.skippedReason) {
    return { prospect, outcome };
  }

  await transitionCargoCarrierLifecycleStage(prospectId, "FOLLOW_UP_PENDING");
  const updated = await recordCargoCarrierFollowUpCounters(prospectId, outcome.attemptNumber);

  return { prospect: updated, outcome };
}

/** CONTACTED/FOLLOW_UP_PENDING -> RESPONDED. Stamps respondedAt, which
 * followUpWithCargoCarrierProspect / sendProspectFollowUp treat as an
 * immediate, permanent stop condition for further follow-up. */
export async function recordCargoCarrierResponse(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<CargoCarrierProspect>> {
  const result = await transitionCargoCarrierLifecycleStage(prospectId, "RESPONDED", { respondedAt: new Date() });
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "CARGO_CARRIER_CONTRACTOR", action: "cargo_carrier_contractor.lead_responded", entityType: "CargoCarrierProspect", entityId: prospectId });
  }
  return result;
}

/** RESPONDED -> HANDOFF_READY. */
export async function markCargoCarrierHandoffReady(ctx: AgentContext, prospectId: string): Promise<LifecycleTransitionResult<CargoCarrierProspect>> {
  const result = await transitionCargoCarrierLifecycleStage(prospectId, "HANDOFF_READY");
  if (!result.deduplicated) {
    await logAgentAction({ ctx, agent: "CARGO_CARRIER_CONTRACTOR", action: "cargo_carrier_contractor.handoff_ready", entityType: "CargoCarrierProspect", entityId: prospectId });
  }
  return result;
}

export interface CompleteCargoCarrierHandoffResult {
  prospect: CargoCarrierProspect;
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
export async function completeCargoCarrierHandoff(
  ctx: AgentContext,
  prospectId: string,
): Promise<CompleteCargoCarrierHandoffResult> {
  const prospect = await getCargoCarrierProspect(prospectId);
  if (!prospect) throw new ProspectLifecycleNotFoundError(prospectId);

  const fingerprint = computeContactFingerprint({ phone: prospect.rawPhone, telegramUsername: prospect.rawTelegramUsername });

  const availableCapabilities = [
    prospect.fleetTypeText,
    prospect.cargoBodyTypeText,
    prospect.geographicCoverageText,
    prospect.localIntercityInternationalText,
    prospect.recurringRoutesNote,
    prospect.schedulingText,
    prospect.rawCapacityText,
    prospect.rawRouteText,
    prospect.rawTemperatureCapability ? "temperature-controlled" : null,
    prospect.rawBackhaulText,
  ].filter((v): v is string => !!v);

  const { handoff, deduplicated: handoffDeduplicated } = await createProspectHandoff(ctx, {
    prospectType: "CARGO_CARRIER_SUPPLY",
    prospectRef: prospectId,
    sourceAgent: "CARGO_CARRIER_CONTRACTOR",
    targetAgentOrDepartment: "CARGO_OPERATIONS",
    expressedInterest: "yes",
    contactData: prospect.rawPhone ?? prospect.rawTelegramUsername ?? "UNKNOWN",
    requestedService: prospect.carrierIdentityName ?? prospect.rawVehicleText ?? "UNKNOWN",
    availableCapabilities,
    contactFingerprint: fingerprint,
    idempotencyKey: `cargo-carrier-contractor:${prospectId}:lifecycle-handoff:CARGO_OPERATIONS`,
  });

  const { prospect: updated, deduplicated } = await transitionCargoCarrierLifecycleStage(prospectId, "HANDED_OFF");

  if (!deduplicated) {
    await logAgentAction({
      ctx,
      agent: "CARGO_CARRIER_CONTRACTOR",
      action: "cargo_carrier_contractor.lifecycle_handed_off",
      entityType: "CargoCarrierProspect",
      entityId: prospectId,
      details: { targetAgentOrDepartment: "CARGO_OPERATIONS", handoffId: handoff.id },
    });
  }

  return { prospect: updated, deduplicated, handoff, handoffDeduplicated };
}
