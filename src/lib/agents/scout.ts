// RT SCOUT — builds the "Driver Intelligence" market database from
// permitted sources (Telegram/WhatsApp groups, Lalafo, manual import).
// Fingerprint/dedup is confidence-scored; anything short of near-certain
// stays PENDING_REVIEW — this agent must never silently merge two drivers.
import type { Driver, DriverCategory, ScoutReviewStatus, ScoutSourceType } from "@prisma/client";
import { db } from "@/lib/db";
import { logAgentAction } from "./trace";
import type { AgentContext, AgentContract } from "./types";

export const SCOUT_AGENT_CONTRACT: AgentContract = {
  name: "SCOUT",
  mission: "Ingest driver sightings from permitted sources, deduplicate against known drivers by fingerprint, and surface the RT Repeat Score / driver category.",
  inputs: ["raw sighting text + source", "phone/telegram/plate/car/route signals if present"],
  outputs: ["ScoutCandidate record", "confidence-scored match candidates", "Driver.repeatScore / category updates"],
  permissions: ["read/write ScoutCandidate", "read Driver", "write Driver.repeatScore/category/lastScoutSeenAt only after human review or an unambiguous auto-link", "write AuditLogEntry"],
  prohibitedActions: [
    "never auto-link two drivers below the auto-link confidence threshold",
    "never fabricate a phone/plate/username that wasn't actually present in the source text",
    "never scrape a group without prior admin consent (out of this agent's scope — consent is enforced at ingestion/TelegramGroup level)",
  ],
  kpi: ["% of candidates auto-linked vs needing manual review", "false-merge rate (should be ~0)", "count of newly discovered ANCHOR/REGULAR drivers"],
  escalationRules: ["confidence below the auto-link threshold always requires a dispatcher decision before any Driver record is touched"],
};

// Any match below this confidence must go through manual review; auto-link
// only fires for combinations strong enough that a false merge is very unlikely
// (e.g. phone + telegram username, or phone + plate — never a single weak signal alone).
export const AUTO_LINK_CONFIDENCE_THRESHOLD = 0.9;

export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.startsWith("00996")) digits = digits.slice(2);
  if (digits.startsWith("996") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `996${digits.slice(1)}`;
  if (digits.length === 9) return `996${digits}`;
  return digits;
}

export function normalizeTelegramUsername(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^@/, "").toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizePlate(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[^A-ZА-Я0-9]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

export interface FingerprintInput {
  normalizedPhone: string | null;
  telegramUsername: string | null;
  carPlate: string | null;
  carModel: string | null;
}

export interface FingerprintMatch {
  confidence: number;
  signals: string[];
}

/** Pure: score how likely `candidate` and `driver` are the same real-world driver. No I/O. */
export function scoreFingerprintMatch(candidate: FingerprintInput, driver: FingerprintInput): FingerprintMatch {
  // Accumulated as integer "points out of 100" and divided once at the end,
  // so 0.6 + 0.3 combinations land exactly on 0.9 instead of drifting to
  // 0.8999999999999999 from binary floating-point addition.
  let points = 0;
  const signals: string[] = [];

  if (candidate.normalizedPhone && candidate.normalizedPhone === driver.normalizedPhone) {
    points += 60;
    signals.push("phone_match");
  }
  if (candidate.telegramUsername && candidate.telegramUsername === driver.telegramUsername) {
    points += 30;
    signals.push("telegram_username_match");
  }
  const candidatePlate = normalizePlate(candidate.carPlate);
  const driverPlate = normalizePlate(driver.carPlate);
  if (candidatePlate && driverPlate && candidatePlate === driverPlate) {
    points += 35;
    signals.push("car_plate_match");
  }
  if (candidate.carModel && driver.carModel && candidate.carModel.trim().toLowerCase() === driver.carModel.trim().toLowerCase()) {
    points += 10;
    signals.push("car_model_match");
  }

  return { confidence: Math.min(1, points / 100), signals };
}

export function decideReviewStatus(confidence: number): Extract<ScoutReviewStatus, "AUTO_LINKED" | "PENDING_REVIEW"> {
  return confidence >= AUTO_LINK_CONFIDENCE_THRESHOLD ? "AUTO_LINKED" : "PENDING_REVIEW";
}

export interface RepeatSignals {
  distinctDaysActive: number;
  distinctGroups: number;
  hasReturnLegPosting: boolean;
  parcelPostings: number;
  sameRouteRepeats: number;
}

/** Pure: turn raw activity signals into the RT Repeat Score. No I/O. */
export function computeRepeatScore(signals: RepeatSignals): number {
  return (
    Math.min(signals.distinctDaysActive, 30) * 2 +
    Math.min(signals.distinctGroups, 5) * 5 +
    (signals.hasReturnLegPosting ? 15 : 0) +
    Math.min(signals.parcelPostings, 10) * 2 +
    Math.min(signals.sameRouteRepeats, 20) * 3
  );
}

/** Pure: map a repeat score (+ dispatcher/fleet flag) to a DriverCategory. No I/O. */
export function categorizeDriver(repeatScore: number, isMultiVehicleDispatcher: boolean): DriverCategory {
  if (isMultiVehicleDispatcher) return "DISPATCHER_FLEET";
  if (repeatScore >= 100) return "ANCHOR";
  if (repeatScore >= 40) return "REGULAR";
  if (repeatScore > 0) return "OCCASIONAL";
  return "UNKNOWN";
}

function toFingerprintInput(d: Pick<Driver, "phone" | "telegramUsername" | "carPlate" | "carModel">): FingerprintInput {
  return {
    normalizedPhone: normalizePhone(d.phone),
    telegramUsername: normalizeTelegramUsername(d.telegramUsername),
    carPlate: d.carPlate,
    carModel: d.carModel,
  };
}

export interface ImportScoutCandidateParams {
  sourceType: ScoutSourceType;
  sourceGroupId?: string;
  sourceText: string;
  rawPhone?: string;
  rawTelegramUsername?: string;
  rawName?: string;
  rawCarModel?: string;
  rawCarPlate?: string;
  rawRouteText?: string;
  rawOriginStopId?: string;
  rawDestinationStopId?: string;
  rawTravelDate?: Date;
  rawPriceSom?: number;
  rawSeats?: number;
  extractionConfidence?: number;
}

/** Import a sighting, score it against every known driver, and store the top candidates. Auto-links only above the safety threshold. */
export async function importScoutCandidate(ctx: AgentContext, params: ImportScoutCandidateParams) {
  const normalizedPhone = normalizePhone(params.rawPhone);
  const candidateFingerprint: FingerprintInput = {
    normalizedPhone,
    telegramUsername: normalizeTelegramUsername(params.rawTelegramUsername),
    carPlate: params.rawCarPlate ?? null,
    carModel: params.rawCarModel ?? null,
  };

  const knownDrivers = await db.driver.findMany();
  const scored = knownDrivers
    .map((driver) => ({ driver, match: scoreFingerprintMatch(candidateFingerprint, toFingerprintInput(driver)) }))
    .filter((s) => s.match.confidence > 0)
    .sort((a, b) => b.match.confidence - a.match.confidence);

  const best = scored[0];
  const reviewStatus = best ? decideReviewStatus(best.match.confidence) : "PENDING_REVIEW";

  const candidate = await db.scoutCandidate.create({
    data: {
      sourceType: params.sourceType,
      sourceGroupId: params.sourceGroupId,
      sourceText: params.sourceText,
      rawPhone: params.rawPhone,
      rawTelegramUsername: params.rawTelegramUsername,
      rawName: params.rawName,
      rawCarModel: params.rawCarModel,
      rawCarPlate: params.rawCarPlate,
      rawRouteText: params.rawRouteText,
      rawOriginStopId: params.rawOriginStopId,
      rawDestinationStopId: params.rawDestinationStopId,
      rawTravelDate: params.rawTravelDate,
      rawPriceSom: params.rawPriceSom,
      rawSeats: params.rawSeats,
      extractionConfidence: params.extractionConfidence,
      normalizedPhone,
      reviewStatus,
      matchCandidates: scored.slice(0, 5).map((s) => ({ driverId: s.driver.id, confidence: s.match.confidence, signals: s.match.signals })),
      linkedDriverId: reviewStatus === "AUTO_LINKED" ? best!.driver.id : null,
    },
  });

  if (reviewStatus === "AUTO_LINKED" && best) {
    await db.driver.update({ where: { id: best.driver.id }, data: { lastScoutSeenAt: new Date() } });
  }

  await logAgentAction({
    ctx,
    agent: "SCOUT",
    action: reviewStatus === "AUTO_LINKED" ? "scout.candidate_auto_linked" : "scout.candidate_pending_review",
    entityType: "ScoutCandidate",
    entityId: candidate.id,
    details: { topConfidence: best?.match.confidence ?? 0, candidateCount: scored.length },
  });

  return candidate;
}

/** Dispatcher decision on a PENDING_REVIEW candidate: link to an existing driver, reject, or spin up a new Driver record. */
export async function reviewScoutCandidate(
  ctx: AgentContext,
  candidateId: string,
  decision: { action: "LINK"; driverId: string } | { action: "REJECT" } | { action: "CREATE_NEW"; telegramUserId: string },
  reviewedByAdminId: string,
) {
  const candidate = await db.scoutCandidate.findUniqueOrThrow({ where: { id: candidateId } });

  let linkedDriverId: string | null = null;
  let reviewStatus: ScoutReviewStatus;

  if (decision.action === "LINK") {
    linkedDriverId = decision.driverId;
    reviewStatus = "MANUALLY_LINKED";
    await db.driver.update({ where: { id: decision.driverId }, data: { lastScoutSeenAt: new Date() } });
  } else if (decision.action === "CREATE_NEW") {
    const newDriver = await db.driver.create({
      data: {
        telegramUserId: decision.telegramUserId,
        telegramUsername: candidate.rawTelegramUsername,
        phone: candidate.rawPhone,
        name: candidate.rawName,
        carModel: candidate.rawCarModel,
        carPlate: candidate.rawCarPlate,
        lastScoutSeenAt: new Date(),
      },
    });
    linkedDriverId = newDriver.id;
    reviewStatus = "NEW_DRIVER_CREATED";
  } else {
    reviewStatus = "REJECTED";
  }

  const updated = await db.scoutCandidate.update({
    where: { id: candidateId },
    data: { reviewStatus, linkedDriverId, reviewedByAdminId, reviewedAt: new Date() },
  });

  await logAgentAction({
    ctx,
    agent: "SCOUT",
    action: "scout.candidate_reviewed",
    entityType: "ScoutCandidate",
    entityId: candidateId,
    details: { decision, reviewedByAdminId },
  });

  return updated;
}

/** Recompute and persist a driver's RT Repeat Score + category from freshly aggregated signals. */
export async function refreshDriverRepeatScore(ctx: AgentContext, driverId: string, signals: RepeatSignals, isMultiVehicleDispatcher: boolean) {
  const repeatScore = computeRepeatScore(signals);
  const category = categorizeDriver(repeatScore, isMultiVehicleDispatcher);

  const driver = await db.driver.update({ where: { id: driverId }, data: { repeatScore, category } });

  await logAgentAction({
    ctx,
    agent: "SCOUT",
    action: "scout.repeat_score_refreshed",
    entityType: "Driver",
    entityId: driverId,
    details: { repeatScore, category, signals },
  });

  return driver;
}
