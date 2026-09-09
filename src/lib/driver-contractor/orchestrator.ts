// DRIVER_CONTRACTOR — proactive driver-supply acquisition. Reuses SCOUT's
// existing fingerprint/import pipeline rather than owning a second one
// (spec: "reuse existing SCOUT infrastructure"), and only ever initiates
// outreach when RT OFFICE's Market Gap shows a real, live shortage — never a
// standing broadcast, never an invented number.
import type { ScoutSourceType } from "@prisma/client";
import { importScoutCandidate, normalizePhone } from "@/lib/agents/scout";
import type { AgentContext, AgentContract } from "@/lib/agents/types";
import { logAgentAction } from "@/lib/agents/trace";
import { classifyMarketRole, isActionableClassification } from "@/lib/acquisition/role-classifier";
import { sendAcquisitionOutreach } from "@/lib/acquisition/outreach-log";
import { computeMarketGap, type MarketGapResult } from "@/lib/rt-office/market-gap";
import type { DriverContractorOutcome, DriverSightingInput, DriverSightingSourceType } from "./types";

export const DRIVER_CONTRACTOR_AGENT_CONTRACT: AgentContract = {
  name: "DRIVER_CONTRACTOR",
  mission:
    "Grow verified driver supply: classify public/permitted market sightings for driver intent, import them through SCOUT's existing fingerprint pipeline, and send opt-in-respecting acquisition outreach only when RT OFFICE's Market Gap shows a real driver shortage.",
  inputs: ["raw sighting text + source (permitted channels only)", "RT OFFICE Market Gap priority signal"],
  outputs: ["ScoutCandidate rows (via SCOUT's existing importScoutCandidate — never a second write path)", "AcquisitionOutreachEvent rows for driver prospects"],
  permissions: [
    "call scout.importScoutCandidate (SCOUT's existing exclusive ingestion path)",
    "read RT OFFICE's Market Gap (rt-office/market-gap.ts, read-only)",
    "create AcquisitionOutreachEvent (shared outreach ledger, prospectType DRIVER)",
    "write AuditLogEntry (agent: DRIVER_CONTRACTOR)",
  ],
  prohibitedActions: [
    "never write ScoutCandidate or Driver directly — always through SCOUT's importScoutCandidate/reviewScoutCandidate",
    "never invent a phone/telegram/plate signal that isn't present in the source text",
    "never message as Mira or claim to be Mira",
    "never send outreach outside sendAcquisitionOutreach's safety gate (do-not-contact, rate-limit, honest DRY_RUN/SANDBOX/NO_PROVIDER_CONFIGURED exposure)",
    "never invent a market-gap number — always reads rt-office/market-gap.ts's live computation",
    "never contact a prospect with no verifiable contact channel actually present in the source text",
  ],
  kpi: ["new ANCHOR/REGULAR drivers sourced per HIGH_DRIVER_ACQUISITION_NEED window", "outreach SENT rate vs RATE_LIMITED/DO_NOT_CONTACT"],
  escalationRules: ["a sighting classified below MIN_ACTIONABLE_CONFIDENCE, or not role DRIVER, is never imported — treated as a skip, not a guess"],
  reportsTo: "ARTUR",
  canRead: ["scout_candidate", "market_gap", "acquisition_outreach_event"],
  canExecute: ["driver_contractor.process_sighting"],
  ownsExclusiveCapabilities: ["driver_acquisition_outreach"],
  forbiddenCapabilities: [
    "external_customer_communication",
    "confirm_cargo_payment",
    "central_treasury_transaction_record",
    "drive_crm_event_write",
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

// AcquisitionSourceType and ScoutSourceType share the same member names for
// every value a driver sighting can carry (PUBLIC_AD is excluded from
// DriverSightingSourceType — see types.ts) — this mapping stays an explicit
// switch rather than a cast so a future divergence between the two enums is
// a compile error here, not a silent mismatch.
function toScoutSourceType(sourceType: DriverSightingSourceType): ScoutSourceType {
  switch (sourceType) {
    case "TELEGRAM_GROUP":
      return "TELEGRAM_GROUP";
    case "WHATSAPP_GROUP":
      return "WHATSAPP_GROUP";
    case "LALAFO":
      return "LALAFO";
    case "MANUAL_IMPORT":
      return "MANUAL_IMPORT";
    case "INTERNAL":
      return "INTERNAL";
  }
}

function buildDriverOutreachMessage(): string {
  return [
    "Салам! Биз RT — облустар аралык жүргүнчү ташуучу платформа. Сизге дал ушул багытта жолоочу керек болушу мүмкүн деп ойлодук.",
    "Здравствуйте! Мы RT — платформа для межгородских поездок. Судя по вашему объявлению, вам может понадобиться пассажир на этом направлении.",
    "Кызыксаңыз, RT ботуна жазыңыз / Если интересно — напишите нашему боту, чтобы начать работать с нами.",
  ].join(" ");
}

/** Only a real, present-in-the-text phone number is a usable outreach
 * channel: an unlinked public Telegram username has no known chat id to
 * message (the bot can only DM a user who has already started a
 * conversation with it), so outreach is honestly skipped rather than
 * attempted against an address we don't actually have. */
function resolvableOutreachChannel(input: DriverSightingInput): { channel: "WHATSAPP"; to: string } | null {
  const phone = normalizePhone(input.rawPhone);
  return phone ? { channel: "WHATSAPP", to: phone } : null;
}

/** Classifies one raw driver sighting, imports it through SCOUT when it
 * genuinely looks like a driver, and — only when RT OFFICE's live Market Gap
 * says the corridor has a real shortage and a real contact channel exists —
 * sends one rate-limited, do-not-contact-respecting outreach message. */
export async function processDriverMarketSighting(ctx: AgentContext, input: DriverSightingInput): Promise<DriverContractorOutcome> {
  const classification = await classifyMarketRole(input.sourceText);

  if (!isActionableClassification(classification) || classification.role !== "DRIVER") {
    return { outcome: "SKIPPED_NOT_A_DRIVER_SIGHTING", classification };
  }

  const candidate = await importScoutCandidate(ctx, {
    sourceType: toScoutSourceType(input.sourceType),
    sourceGroupId: input.sourceGroupId,
    sourceText: input.sourceText,
    rawPhone: input.rawPhone,
    rawTelegramUsername: input.rawTelegramUsername,
    rawCarModel: input.rawCarModel,
    rawCarPlate: input.rawCarPlate,
    rawRouteText: input.rawRouteText,
    rawOriginStopId: input.rawOriginStopId,
    rawDestinationStopId: input.rawDestinationStopId,
    rawTravelDate: input.rawTravelDate,
    extractionConfidence: classification.confidence,
  });

  await logAgentAction({
    ctx,
    agent: "DRIVER_CONTRACTOR",
    action: "driver_contractor.sighting_imported",
    entityType: "ScoutCandidate",
    entityId: candidate.id,
    details: { role: classification.role, confidence: classification.confidence, sourceType: input.sourceType },
  });

  const marketGap: MarketGapResult = await computeMarketGap({ corridorId: input.corridorId });

  const outreach = await maybeSendDriverOutreach(candidate.id, input, marketGap);

  return { outcome: "IMPORTED", scoutCandidateId: candidate.id, classification, marketGap, outreach };
}

async function maybeSendDriverOutreach(scoutCandidateId: string, input: DriverSightingInput, marketGap: MarketGapResult) {
  if (marketGap.priority !== "HIGH_DRIVER_ACQUISITION_NEED") return null;

  const target = resolvableOutreachChannel(input);
  if (!target) return null;

  return sendAcquisitionOutreach({
    contractorAgent: "DRIVER_CONTRACTOR",
    prospectType: "DRIVER",
    prospectRef: scoutCandidateId,
    channel: target.channel,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    to: target.to,
    text: buildDriverOutreachMessage(),
    idempotencyKey: `driver-contractor:${scoutCandidateId}:acquisition-outreach`,
  });
}

/** Read-only priority check for the dispatcher UI / other contractors — never
 * a second computation, always this same live Market Gap read. */
export async function driverAcquisitionPriority(corridorId?: string): Promise<MarketGapResult> {
  return computeMarketGap({ corridorId });
}
