// DELIVERY_CONTRACTOR — business-partnership acquisition and the Delivery
// CRM. Sources candidate businesses (grocery/retail/wholesale/etc.) from
// permitted public sources, tracks them through its own BusinessProspect
// pipeline, and appends every partnership-lifecycle fact to its own
// append-only DeliveryCrmEvent log — both exclusively its own models, never
// a second Partner or Shipment source of truth (those stay RT Core's / Sapar's).
import { normalizePhone } from "@/lib/agents/scout";
import type { AgentContext, AgentContract } from "@/lib/agents/types";
import { logAgentAction } from "@/lib/agents/trace";
import { classifyMarketRole, isActionableClassification } from "@/lib/acquisition/role-classifier";
import { sendAcquisitionOutreach } from "@/lib/acquisition/outreach-log";
import { canTransitionBusinessProspect, createBusinessProspect, findExistingBusinessProspect, guessBusinessCategory, linkBusinessProspectToPartner, transitionBusinessProspectStatus } from "./prospect";
import { recordDeliveryCrmEvent } from "./crm";
import type { BusinessSightingInput, DeliveryContractorOutcome } from "./types";

export const DELIVERY_CONTRACTOR_AGENT_CONTRACT: AgentContract = {
  name: "DELIVERY_CONTRACTOR",
  mission:
    "Grow RT's delivery business-partnership pipeline: classify public/permitted market sightings for business-advertisement intent, track them in BusinessProspect through to a partnership decision, and log the full relationship history in the Delivery CRM — never a second Partner or Shipment source of truth.",
  inputs: [
    "raw sighting text + source (permitted channels only)",
    "dispatcher-triggered lifecycle decisions (qualify / partner / decline / handoff)",
    "Mira's inbound partner/business-inquiry classification (bounded — Mira never re-classifies, never sends outreach on this agent's behalf)",
  ],
  outputs: ["BusinessProspect rows (its own exclusive model)", "DeliveryCrmEvent rows (its own append-only log)", "AcquisitionOutreachEvent rows for business prospects"],
  permissions: [
    "create/update BusinessProspect (its own exclusive write surface)",
    "create DeliveryCrmEvent (its own exclusive append-only write surface)",
    "create AcquisitionOutreachEvent (shared outreach ledger, prospectType BUSINESS)",
    "write AuditLogEntry (agent: DELIVERY_CONTRACTOR)",
  ],
  prohibitedActions: [
    "never write Partner or Shipment directly — a BusinessProspect only ever becomes a Partner through an out-of-band onboarding step; linkedPartnerId is recorded after the fact, never a write into Partner itself",
    "never confirm or process cargo payment — that stays SAPARGUL's exclusive capability",
    "never invent a phone/handle/category signal that isn't present in the source text",
    "never message a prospect as Mira or claim to be Mira",
    "never send outreach outside sendAcquisitionOutreach's safety gate",
    "never update or delete a DeliveryCrmEvent row — a mistaken fact is only ever corrected by appending a new CORRECTION event referencing it",
    "never force an illegal BusinessProspect lifecycle transition (see prospect.ts's canTransitionBusinessProspect)",
  ],
  kpi: ["business prospects reaching PARTNERED status", "% of DeliveryCrmEvent appends that are clean (non-duplicate)"],
  escalationRules: ["a sighting classified below MIN_ACTIONABLE_CONFIDENCE, or not role BUSINESS_ADVERTISEMENT, is never turned into a prospect", "an illegal lifecycle transition is rejected rather than forced"],
  reportsTo: "ARTUR",
  canRead: ["business_prospect", "delivery_crm_event", "acquisition_outreach_event"],
  canExecute: [
    "delivery_contractor.process_sighting",
    "delivery_contractor.record_inbound_prospect",
    "delivery_contractor.qualify",
    "delivery_contractor.agree_partnership",
    "delivery_contractor.handoff_to_operations",
  ],
  ownsExclusiveCapabilities: ["business_prospect_write", "delivery_crm_event_write"],
  forbiddenCapabilities: [
    "external_customer_communication",
    "confirm_cargo_payment",
    "central_treasury_transaction_record",
    "drive_crm_event_write",
    "driver_acquisition_outreach",
    "passenger_prospect_write",
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

function buildBusinessOutreachMessage(): string {
  return [
    "Салам! Биз RT — облустар аралык жеткирүү платформасы. Сиздин бизнес үчүн ишенимдүү жеткирүү өнөктөштүгүн сунуштайбыз.",
    "Здравствуйте! Мы RT — платформа межгородской доставки. Хотели бы предложить вашему бизнесу надёжное партнёрство по доставке.",
    "Кызыксаңыз, RT ботуна жазыңыз / Если интересно — напишите нашему боту, чтобы обсудить условия.",
  ].join(" ");
}

function resolvableOutreachChannel(input: BusinessSightingInput): { channel: "WHATSAPP"; to: string } | null {
  const phone = normalizePhone(input.contactPhone);
  return phone ? { channel: "WHATSAPP", to: phone } : null;
}

/** Classifies one raw business sighting, tracks it in BusinessProspect
 * (deduped against any prospect we already know), and — when a real contact
 * channel exists — sends one rate-limited, do-not-contact-respecting
 * outreach message and appends the first Delivery CRM event. */
export async function processBusinessMarketSighting(ctx: AgentContext, input: BusinessSightingInput): Promise<DeliveryContractorOutcome> {
  const classification = await classifyMarketRole(input.sourceText);

  if (!isActionableClassification(classification) || classification.role !== "BUSINESS_ADVERTISEMENT") {
    return { outcome: "SKIPPED_NOT_A_BUSINESS_SIGHTING", classification };
  }

  const existing = await findExistingBusinessProspect(input);
  if (existing) {
    return { outcome: "ALREADY_KNOWN", prospect: existing };
  }

  const category = guessBusinessCategory(classification.businessCategoryGuess);
  const prospect = await createBusinessProspect(input, category);

  await logAgentAction({
    ctx,
    agent: "DELIVERY_CONTRACTOR",
    action: "delivery_contractor.prospect_created",
    entityType: "BusinessProspect",
    entityId: prospect.id,
    details: { category, confidence: classification.confidence, sourceType: input.sourceType },
  });

  const outreach = await maybeSendBusinessOutreach(ctx, prospect.id, input);

  return { outcome: "PROSPECT_CREATED", prospect, classification, outreach };
}

async function maybeSendBusinessOutreach(ctx: AgentContext, prospectId: string, input: BusinessSightingInput) {
  const target = resolvableOutreachChannel(input);
  if (!target) return null;

  const outreach = await sendAcquisitionOutreach({
    contractorAgent: "DELIVERY_CONTRACTOR",
    prospectType: "BUSINESS",
    prospectRef: prospectId,
    channel: target.channel,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    to: target.to,
    text: buildBusinessOutreachMessage(),
    idempotencyKey: `delivery-contractor:${prospectId}:acquisition-outreach`,
  });

  await transitionBusinessProspectStatus(prospectId, "CONTACTED");
  await recordDeliveryCrmEvent({
    businessProspectId: prospectId,
    eventType: "OUTREACH_SENT",
    source: "DELIVERY_CONTRACTOR",
    details: { channel: target.channel, outreachStatus: outreach.status },
    idempotencyKey: `delivery-contractor:${prospectId}:outreach-sent-event`,
  });

  return outreach;
}

/** Deterministic lifecycle transition, always dispatcher-triggered: a
 * CONTACTED prospect that has demonstrated real delivery need becomes
 * QUALIFIED. Rejects an illegal jump rather than forcing it. */
export async function qualifyBusinessProspect(ctx: AgentContext, prospectId: string, current: { status: Parameters<typeof canTransitionBusinessProspect>[0] }, note?: string) {
  if (!canTransitionBusinessProspect(current.status, "QUALIFIED")) {
    throw new Error(`Delivery Contractor rejected transition: cannot move a ${current.status} prospect to QUALIFIED`);
  }
  const prospect = await transitionBusinessProspectStatus(prospectId, "QUALIFIED");
  await recordDeliveryCrmEvent({
    businessProspectId: prospectId,
    eventType: "QUALIFIED",
    source: "DELIVERY_CONTRACTOR",
    details: note ? { note } : undefined,
    idempotencyKey: `delivery-contractor:${prospectId}:qualified`,
  });
  await logAgentAction({ ctx, agent: "DELIVERY_CONTRACTOR", action: "delivery_contractor.qualified", entityType: "BusinessProspect", entityId: prospectId, details: { note } });
  return prospect;
}

/** A partnership agreement is the one transition allowed to record a real
 * Partner linkage — never a Partner write itself, only a pointer to one that
 * already exists (onboarding a Partner record stays out of this agent's scope). */
export async function agreeBusinessPartnership(ctx: AgentContext, prospectId: string, current: { status: Parameters<typeof canTransitionBusinessProspect>[0] }, linkedPartnerId?: string) {
  if (!canTransitionBusinessProspect(current.status, "PARTNERED")) {
    throw new Error(`Delivery Contractor rejected transition: cannot move a ${current.status} prospect to PARTNERED`);
  }
  const partnered = await transitionBusinessProspectStatus(prospectId, "PARTNERED");
  const prospect = linkedPartnerId ? await linkBusinessProspectToPartner(prospectId, linkedPartnerId) : partnered;
  await recordDeliveryCrmEvent({
    businessProspectId: prospectId,
    eventType: "PARTNERSHIP_AGREED",
    source: "DELIVERY_CONTRACTOR",
    details: linkedPartnerId ? { linkedPartnerId } : undefined,
    idempotencyKey: `delivery-contractor:${prospectId}:partnership-agreed`,
  });
  await logAgentAction({ ctx, agent: "DELIVERY_CONTRACTOR", action: "delivery_contractor.partnership_agreed", entityType: "BusinessProspect", entityId: prospectId, details: { linkedPartnerId } });
  return prospect;
}

/** Bounded entry point for an inbound business/partner inquiry Mira already
 * classified and is about to reply to herself (never a cold sighting from a
 * public source, so — unlike processBusinessMarketSighting — this never
 * triggers sendAcquisitionOutreach: a second, contractor-initiated message to
 * a customer already mid-conversation with Mira would blur Mira's exclusive
 * external_customer_communication capability). Dedupes against any prospect
 * already on file and never re-classifies the text — Mira's own top-intent
 * classifier already decided this is a partner/business inquiry. */
export async function recordInboundBusinessProspect(
  ctx: AgentContext,
  input: { sourceText: string; sourceRef?: string; contactPhone?: string; contactHandle?: string; businessName?: string },
): Promise<{ prospectId: string; created: boolean }> {
  const sightingInput: BusinessSightingInput = {
    sourceType: "INTERNAL",
    sourceRef: input.sourceRef,
    sourceText: input.sourceText,
    businessName: input.businessName,
    contactPhone: input.contactPhone,
    contactHandle: input.contactHandle,
  };

  const existing = await findExistingBusinessProspect(sightingInput);
  if (existing) {
    return { prospectId: existing.id, created: false };
  }

  const category = guessBusinessCategory(input.sourceText);
  const prospect = await createBusinessProspect(sightingInput, category);
  await logAgentAction({
    ctx,
    agent: "DELIVERY_CONTRACTOR",
    action: "delivery_contractor.inbound_prospect_created",
    entityType: "BusinessProspect",
    entityId: prospect.id,
    details: { category, source: "MIRA_INBOUND" },
  });
  return { prospectId: prospect.id, created: true };
}

/** Marks the business as live in Sapar's operational delivery flow — an
 * append-only handoff record, never a Shipment write itself. */
export async function handoffBusinessToOperations(ctx: AgentContext, prospectId: string, details?: Record<string, unknown>) {
  const outcome = await recordDeliveryCrmEvent({
    businessProspectId: prospectId,
    eventType: "HANDOFF_TO_OPERATIONS",
    source: "DELIVERY_CONTRACTOR",
    details,
    idempotencyKey: `delivery-contractor:${prospectId}:handoff-to-operations`,
  });
  await logAgentAction({ ctx, agent: "DELIVERY_CONTRACTOR", action: "delivery_contractor.handoff_to_operations", entityType: "BusinessProspect", entityId: prospectId, details });
  return outcome;
}
