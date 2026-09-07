// Deterministic severity ladder (AGENTS Master Architecture spec s.19) — the
// LLM reasoning layer (src/lib/artur/reasoning-provider.ts) may add
// commentary on TOP of a severity Claude already sees, but it never assigns
// the severity itself. Every function here is a pure, thresholded rule.
import type { Severity, RtStatus } from "@prisma/client";

const SEVERITY_ORDER: Severity[] = ["INFO", "NORMAL", "ATTENTION", "HIGH", "CRITICAL"];

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

export function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

/** Rolls a set of signal severities up into the single top-line RT status
 * shown in section 1 of the daily Founder Brief (spec s.10.1). */
export function overallRtStatus(signalSeverities: Severity[]): RtStatus {
  const worst = signalSeverities.reduce<Severity>((acc, s) => maxSeverity(acc, s), "INFO");
  if (worst === "CRITICAL" || worst === "HIGH") return "CRITICAL";
  if (worst === "ATTENTION") return "ATTENTION";
  return "NORMAL";
}

/** Open-case-age escalation, reused across incident/case backlogs (Adilet,
 * AccountantCase, ShipmentIncident) so "how stale is too stale" is one rule,
 * not one per domain. */
export function severityForCaseAgeMs(ageMs: number): Severity {
  const hour = 3_600_000;
  if (ageMs >= 72 * hour) return "CRITICAL";
  if (ageMs >= 24 * hour) return "HIGH";
  if (ageMs >= 6 * hour) return "ATTENTION";
  return "NORMAL";
}

/** Financial-discrepancy severity by outstanding amount (spec s.5 FINANCE
 * section / s.17 "major financial discrepancy" emergency trigger). */
export function severityForDiscrepancySom(amountSom: number): Severity {
  if (amountSom >= 100_000) return "CRITICAL";
  if (amountSom >= 20_000) return "HIGH";
  if (amountSom >= 3_000) return "ATTENTION";
  if (amountSom > 0) return "NORMAL";
  return "INFO";
}

/** A HIGH or CRITICAL signal is the only thing allowed to trigger the
 * force-majeure 24/7 escalation path (spec s.17: "do not use emergency
 * escalation for routine operations"). */
export function isEmergencySeverity(s: Severity): s is "HIGH" | "CRITICAL" {
  return s === "HIGH" || s === "CRITICAL";
}
