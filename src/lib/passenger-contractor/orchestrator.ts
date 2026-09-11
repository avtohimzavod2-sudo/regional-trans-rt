// PASSENGER_CONTRACTOR — proactive passenger-demand acquisition. Symmetric
// counterpart to DRIVER_CONTRACTOR: classifies public/permitted market
// sightings for passenger intent, tracks them in its own PassengerProspect
// model (a genuinely new identity — never a second Passenger/TripRequest
// source of truth), and only reaches out when RT OFFICE's Market Gap shows
// supply genuinely exceeds demand. The handoff is always "message Mira" —
// this agent never itself talks to a prospect as if it were Mira and never
// claims external_customer_communication.
import { normalizePhone } from "@/lib/agents/scout";
import type { AgentContext, AgentContract } from "@/lib/agents/types";
import { logAgentAction } from "@/lib/agents/trace";
import { classifyMarketRole, isActionableClassification } from "@/lib/acquisition/role-classifier";
import { sendAcquisitionOutreach } from "@/lib/acquisition/outreach-log";
import { computeMarketGap, type MarketGapResult } from "@/lib/rt-office/market-gap";
import { computeContactFingerprint } from "@/lib/prospecting/identity";
import { createProspectHandoff } from "@/lib/prospecting/handoff";
import { createPassengerProspect, findExistingProspect, markProspectContacted } from "./prospect";
import type { PassengerContractorOutcome, PassengerSightingInput } from "./types";

export const PASSENGER_CONTRACTOR_AGENT_CONTRACT: AgentContract = {
  name: "PASSENGER_CONTRACTOR",
  mission:
    "Grow passenger demand when RT OFFICE's Market Gap shows verified driver supply exceeding demand: classify public/permitted market sightings for passenger intent, track them in PassengerProspect, and hand qualified prospects off to Mira rather than ever messaging as Mira itself.",
  inputs: ["raw sighting text + source (permitted channels only)", "RT OFFICE Market Gap priority signal"],
  outputs: [
    "PassengerProspect rows (its own exclusive model)",
    "AcquisitionOutreachEvent rows for passenger prospects, always pointing the prospect to message Mira",
    "ProspectHandoff rows via the shared Prospecting Core (targeting MIRA/PASSENGER_OPERATIONS/AKZHOL)",
  ],
  permissions: [
    "create/update PassengerProspect (its own exclusive write surface)",
    "read RT OFFICE's Market Gap (rt-office/market-gap.ts, read-only)",
    "create AcquisitionOutreachEvent (shared outreach ledger, prospectType PASSENGER)",
    "create ProspectHandoff via createProspectHandoff (shared Prospecting Core, never a bespoke handoff)",
    "write AuditLogEntry (agent: PASSENGER_CONTRACTOR)",
  ],
  prohibitedActions: [
    "never write Passenger or TripRequest directly — those remain RT Core's exclusive write surface; conversion is only ever recorded as a PassengerProspect status update referencing an existing TripRequestId",
    "never invent a phone/telegram/route signal that isn't present in the source text",
    "never message a prospect as Mira or claim to be Mira — outreach always hands off to messaging Mira, never carries on the conversation itself",
    "never send outreach outside sendAcquisitionOutreach's safety gate (do-not-contact, rate-limit, honest DRY_RUN/SANDBOX/NO_PROVIDER_CONFIGURED exposure)",
    "never invent a market-gap number — always reads rt-office/market-gap.ts's live computation",
    "never create a duplicate PassengerProspect for a contact signal already on file",
    "never create a ProspectHandoff outside the approved HANDOFF_TARGETS list for PASSENGER_DEMAND",
  ],
  kpi: ["passenger prospects that reach CONVERTED status per PASSENGER_ACQUISITION_NEED window", "outreach SENT rate vs RATE_LIMITED/DO_NOT_CONTACT"],
  escalationRules: ["a sighting classified below MIN_ACTIONABLE_CONFIDENCE, or not role PASSENGER, is never turned into a prospect — treated as a skip, not a guess"],
  reportsTo: "ARTUR",
  canRead: ["passenger_prospect", "market_gap", "acquisition_outreach_event"],
  canExecute: ["passenger_contractor.process_sighting"],
  ownsExclusiveCapabilities: ["passenger_prospect_write"],
  forbiddenCapabilities: [
    "external_customer_communication",
    "confirm_cargo_payment",
    "central_treasury_transaction_record",
    "drive_crm_event_write",
    "driver_acquisition_outreach",
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

function buildPassengerOutreachMessage(): string {
  return [
    "Салам! Биз RT — облустар аралык жүргүнчү ташуучу платформа. Сиздин багыт боюнча ишенимдүү айдоочулар бар.",
    "Здравствуйте! Мы RT — платформа для межгородских поездок. По вашему направлению уже есть проверенные водители.",
    "Орун брондоо үчүн RT ботуна жазыңыз / Чтобы забронировать место, напишите нашему боту.",
  ].join(" ");
}

function resolvableOutreachChannel(input: PassengerSightingInput): { channel: "WHATSAPP"; to: string } | null {
  const phone = normalizePhone(input.rawPhone);
  return phone ? { channel: "WHATSAPP", to: phone } : null;
}

/** Classifies one raw passenger sighting, tracks it in PassengerProspect
 * (deduped against any prospect we already know), and — only when RT
 * OFFICE's live Market Gap says supply genuinely exceeds demand and a real
 * contact channel exists — sends one rate-limited, do-not-contact-respecting
 * outreach message that hands the prospect off to Mira. */
export async function processPassengerMarketSighting(ctx: AgentContext, input: PassengerSightingInput): Promise<PassengerContractorOutcome> {
  const classification = await classifyMarketRole(input.sourceText);

  if (!isActionableClassification(classification) || classification.role !== "PASSENGER") {
    return { outcome: "SKIPPED_NOT_A_PASSENGER_SIGHTING", classification };
  }

  const existing = await findExistingProspect(input);
  if (existing) {
    return { outcome: "ALREADY_KNOWN", prospect: existing };
  }

  const prospect = await createPassengerProspect(input);

  await logAgentAction({
    ctx,
    agent: "PASSENGER_CONTRACTOR",
    action: "passenger_contractor.prospect_created",
    entityType: "PassengerProspect",
    entityId: prospect.id,
    details: { role: classification.role, confidence: classification.confidence, sourceType: input.sourceType },
  });

  const marketGap: MarketGapResult = await computeMarketGap({ corridorId: input.corridorId });
  const outreach = await maybeSendPassengerOutreach(ctx, prospect.id, input, marketGap);

  return { outcome: "PROSPECT_CREATED", prospect, classification, marketGap, outreach };
}

async function maybeSendPassengerOutreach(ctx: AgentContext, prospectId: string, input: PassengerSightingInput, marketGap: MarketGapResult) {
  if (marketGap.priority !== "PASSENGER_ACQUISITION_NEED") return null;

  const target = resolvableOutreachChannel(input);
  if (!target) return null;

  const fingerprint = computeContactFingerprint({ phone: input.rawPhone, telegramUsername: input.rawTelegramUsername });

  const outreach = await sendAcquisitionOutreach({
    contractorAgent: "PASSENGER_CONTRACTOR",
    prospectType: "PASSENGER",
    prospectRef: prospectId,
    channel: target.channel,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    to: target.to,
    text: buildPassengerOutreachMessage(),
    idempotencyKey: `passenger-contractor:${prospectId}:acquisition-outreach`,
    contactFingerprint: fingerprint,
  });

  await markProspectContacted(prospectId);

  if (outreach.status === "SENT" || outreach.status === "DRY_RUN" || outreach.status === "SANDBOX") {
    await createProspectHandoff(ctx, {
      prospectType: "PASSENGER_DEMAND",
      prospectRef: prospectId,
      sourceAgent: "PASSENGER_CONTRACTOR",
      targetAgentOrDepartment: "MIRA",
      expressedInterest: "unknown",
      contactData: target.to,
      requestedService: input.rawRouteText ?? "UNKNOWN",
      contactFingerprint: fingerprint,
      idempotencyKey: `passenger-contractor:${prospectId}:handoff:MIRA`,
    });
  }

  return outreach;
}

/** Read-only priority check for the dispatcher UI / other contractors —
 * never a second computation, always this same live Market Gap read. */
export async function passengerAcquisitionPriority(corridorId?: string): Promise<MarketGapResult> {
  return computeMarketGap({ corridorId });
}
