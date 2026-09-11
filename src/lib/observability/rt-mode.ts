// Dispatcher UI TEST/LIVE indicator (hardening sprint s.13) — normalizes the
// modes already reported by GET /api/health (src/app/api/health/route.ts),
// which itself reads the existing gates: mira/outbound.ts's
// resolveOutboundMode, acquisition/outreach-log.ts's resolveOutreachMode,
// and tyyin/sandbox-adapter.ts's currentTreasuryEnvironment. This module
// adds no new source of truth — it only classifies values that already
// exist — and it never talks to the network itself (see
// src/app/dispatcher/rt-mode-indicator.tsx for the fetch).
//
// Fail-safe by construction: anything not positively recognized as a
// LIVE-equivalent or TEST-equivalent value — a missing field, an
// unexpected type, an unrecognized enum string, a malformed payload —
// resolves to UNKNOWN. There is no code path that defaults an
// unrecognized or absent value to LIVE.
const LIVE_VALUES = new Set(["LIVE", "PRODUCTION"]);
const TEST_VALUES = new Set(["SANDBOX", "DRY_RUN"]);

export type SubsystemNormalizedMode = "LIVE" | "TEST" | "UNKNOWN";

export interface SubsystemStatus {
  name: string;
  raw: string | null;
  normalized: SubsystemNormalizedMode;
}

export type RtMode =
  | { kind: "LIVE"; subsystems: SubsystemStatus[] }
  | { kind: "TEST"; subsystems: SubsystemStatus[] }
  | { kind: "MIXED"; subsystems: SubsystemStatus[] }
  | { kind: "UNKNOWN"; subsystems: SubsystemStatus[]; reason: string };

function normalizeValue(raw: unknown): SubsystemNormalizedMode {
  if (typeof raw !== "string") return "UNKNOWN";
  if (LIVE_VALUES.has(raw)) return "LIVE";
  if (TEST_VALUES.has(raw)) return "TEST";
  return "UNKNOWN";
}

/** `modes` is whatever the caller extracted from a parsed /api/health
 * response body — deliberately typed `unknown` rather than the route's own
 * modes shape, because an unreachable/malformed API response is exactly one
 * of the fail-safe cases this function must classify (as UNKNOWN) rather
 * than throw on. */
export function classifyRtMode(modes: unknown): RtMode {
  if (modes === null || typeof modes !== "object" || Array.isArray(modes)) {
    return { kind: "UNKNOWN", subsystems: [], reason: "no mode data available" };
  }

  const entries = Object.entries(modes as Record<string, unknown>);
  if (entries.length === 0) {
    return { kind: "UNKNOWN", subsystems: [], reason: "no mode data available" };
  }

  const subsystems: SubsystemStatus[] = entries.map(([name, raw]) => ({
    name,
    raw: typeof raw === "string" ? raw : null,
    normalized: normalizeValue(raw),
  }));

  // Any single unrecognized/malformed subsystem value makes the whole
  // status untrustworthy — never partially trust a malformed payload.
  if (subsystems.some((s) => s.normalized === "UNKNOWN")) {
    return { kind: "UNKNOWN", subsystems, reason: "one or more subsystems reported an unrecognized mode value" };
  }
  if (subsystems.every((s) => s.normalized === "LIVE")) {
    return { kind: "LIVE", subsystems };
  }
  if (subsystems.every((s) => s.normalized === "TEST")) {
    return { kind: "TEST", subsystems };
  }
  return { kind: "MIXED", subsystems };
}
