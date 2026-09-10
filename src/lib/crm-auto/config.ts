// CRM Auto policy knobs, read lazily from env so nothing throws at import
// time and every value has a safe, documented default (mirrors
// src/lib/matching/config.ts's pattern). Purely a presentation/freshness
// threshold — never a substitute for a real ETA value.

/** How old a verified ETA fact (DriveCrmEvent OPERATIONAL_ETA) can be before
 * it must be shown to a dispatcher as stale rather than current. The ETA
 * value itself is never replaced or re-derived when stale — only its
 * freshness indicator changes (spec: "never replace it with an invented new
 * value"). */
export function getEtaStalenessMinutes(): number {
  const raw = Number(process.env.CRM_AUTO_ETA_STALENESS_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}
