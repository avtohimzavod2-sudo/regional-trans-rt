// RT OFFICE — Fleet Attention Feed (DRIVER OPERATIONS CENTER pass): a
// computed, non-persisted "who needs the dispatcher's attention right now"
// feed. No new Prisma model, no new matching/alerting engine — pure
// derivation over an already-fetched LiveFleetPicture (spec s.15: never a
// second DB read on the same page as buildLiveFleetPicture()).
//
// Every item here traces to a fact deriveOperationalState()/CRM Auto already
// verified. Explicitly forbidden (spec s.8): inferring lateness from a
// wall-clock comparison, assuming arrival because "should have by now",
// computing an ETA ourselves, inventing a breakdown, or treating absence of
// data as an incident fact.
import { getEtaStalenessMinutes } from "@/lib/crm-auto/config";
import type { DriverOperationalSnapshot, LiveFleetPicture, OperationalState } from "./types";

export type AttentionType = "BREAKDOWN_OPEN" | "VERIFIED_DELAY" | "ETA_STALE" | "ETA_MISSING";
export type AttentionSeverity = "CRITICAL" | "HIGH" | "WARNING" | "INFO";

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { CRITICAL: 0, HIGH: 1, WARNING: 2, INFO: 3 };

export interface OperationalAttentionItem {
  type: AttentionType;
  severity: AttentionSeverity;
  driverId: string;
  driverName: string;
  vehicle: { carModel: string | null; carPlate: string | null };
  operationalState: OperationalState;
  message: string;
  relatedOfferId: string | null;
  relatedTripId: string | null;
  factSource: string | null;
  factAsOf: string | null;
}

export interface FleetAttentionFeed {
  generatedAt: string;
  counts: Record<AttentionSeverity, number>;
  items: OperationalAttentionItem[];
}

/** Only these operational states represent a genuinely active context where
 * a missing/stale ETA is a meaningful gap rather than noise (spec s.8) — an
 * AVAILABLE/ARRIVED/COMPLETED/CANCELLED/BREAKDOWN/OFFLINE driver's ETA field
 * is either irrelevant or already covered by a different alert type. */
const ACTIVE_ETA_STATES = new Set<OperationalState>(["PLANNED", "WAITING_DEPARTURE", "EN_ROUTE", "DELAYED"]);
/** Trip already underway -> a missing ETA is more urgent (WARNING) than one
 * for a trip that hasn't departed yet (INFO) — the one deterministic split
 * the spec allows for ETA_MISSING severity. */
const UNDERWAY_STATES = new Set<OperationalState>(["EN_ROUTE", "DELAYED"]);

function attentionItem(
  d: DriverOperationalSnapshot,
  type: AttentionType,
  severity: AttentionSeverity,
  message: string,
): OperationalAttentionItem {
  return {
    type,
    severity,
    driverId: d.driverId,
    driverName: d.driverName,
    vehicle: d.vehicle,
    operationalState: d.operationalState,
    message,
    relatedOfferId: d.activeOfferId,
    relatedTripId: d.activeTripId,
    factSource: d.etaFreshness?.source ?? null,
    factAsOf: d.etaFreshness?.asOf ?? null,
  };
}

/**
 * Pure, DB-free derivation over an already-fetched LiveFleetPicture (spec
 * s.15) — deliberately takes no `db` dependency, so callers must compute
 * `fleet` once and pass it here rather than re-querying.
 *
 * Rules (spec s.8, each item traceable to a stored/derived fact, never a
 * guess):
 *   - BREAKDOWN_OPEN (CRITICAL): operationalState === "BREAKDOWN", which
 *     deriveOperationalState() only reaches via a real OPEN
 *     BREAKDOWN_INCIDENT — never invented here.
 *   - VERIFIED_DELAY (HIGH): operationalState === "DELAYED", which
 *     deriveOperationalState() only reaches via an explicit verified
 *     delayedSignal on an in-progress trip — never a wall-clock guess.
 *   - ETA_STALE (WARNING): a confirmed ETA exists but is older than the
 *     configured staleness threshold — message says the ETA is stale, never
 *     that the driver is late.
 *   - ETA_MISSING (WARNING/INFO): a genuinely active context with no
 *     confirmed ETA at all — message says no confirmed ETA exists, never
 *     that the driver is lost.
 * ETA_STALE and ETA_MISSING are mutually exclusive per driver (an ETA either
 * exists or it doesn't), so a driver can never receive duplicate identical
 * alerts from a single feed build; a DELAYED driver can additionally receive
 * an ETA_STALE/ETA_MISSING item, since that is a genuinely distinct fact.
 */
export function deriveFleetAttentionFeed(fleet: LiveFleetPicture, now: Date = new Date()): FleetAttentionFeed {
  const stalenessMinutes = getEtaStalenessMinutes();
  const items: OperationalAttentionItem[] = [];

  for (const d of fleet.drivers) {
    if (d.operationalState === "BREAKDOWN") {
      items.push(attentionItem(d, "BREAKDOWN_OPEN", "CRITICAL", "Открытая поломка — требуется решение диспетчера."));
      continue;
    }

    if (d.operationalState === "DELAYED") {
      items.push(attentionItem(d, "VERIFIED_DELAY", "HIGH", "Подтверждённая задержка в пути."));
    }

    if (!ACTIVE_ETA_STATES.has(d.operationalState)) continue;

    if (d.etaMinutes !== null && d.etaFreshness?.stale) {
      items.push(
        attentionItem(d, "ETA_STALE", "WARNING", `ETA устарел (старше ${stalenessMinutes} мин) — нужен свежий факт.`),
      );
    } else if (d.etaMinutes === null) {
      const severity: AttentionSeverity = UNDERWAY_STATES.has(d.operationalState) ? "WARNING" : "INFO";
      items.push(attentionItem(d, "ETA_MISSING", severity, "Нет подтверждённого ETA."));
    }
  }

  // Array#sort is stable (ES2019+) — a comparator returning 0 for equal
  // severities preserves fleet.drivers' original relative order (spec s.9).
  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const counts: Record<AttentionSeverity, number> = { CRITICAL: 0, HIGH: 0, WARNING: 0, INFO: 0 };
  for (const item of items) counts[item.severity] += 1;

  return { generatedAt: now.toISOString(), counts, items };
}
