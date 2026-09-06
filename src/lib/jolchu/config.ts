// All Jolchu thresholds/policy knobs in one place, read lazily from env so
// nothing throws at import time and every value has a safe, documented
// default. None of this is commercial/pricing logic — purely geo/confidence
// policy, per the "no hardcoded commercial logic" requirement.

/** Below this confidence, Jolchu must not silently pick a location — it
 * returns NEEDS_CONFIRMATION instead of guessing (e.g. "Аламедин" could be
 * a market, a district, or a village). */
export function getConfirmationConfidenceThreshold(): number {
  const raw = Number(process.env.JOLCHU_CONFIRMATION_CONFIDENCE_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.6;
}

/** Distance in km beyond the nearest known hub at which a destination is
 * treated as a separate Last Mile segment rather than part of the main
 * intercity route (e.g. Bishkek -> Karakol -> 18km past Karakol). */
export function getLastMileThresholdKm(): number {
  const raw = Number(process.env.JOLCHU_LAST_MILE_THRESHOLD_KM);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

/** Mandatory reference-data refresh cadence (settlements, known hubs,
 * provider capability snapshot, benchmark cases) — NOT live traffic/ETA,
 * which always stays real-time per request. */
export function getDataRefreshIntervalDays(): number {
  const raw = Number(process.env.JOLCHU_DATA_REFRESH_INTERVAL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

/** Road distance ≈ straight-line distance × this factor when a provider does
 * not return a real road distance (mock only — never used to override a real
 * provider's road-distance figure). */
export function getMockRoadDistanceFactor(): number {
  const raw = Number(process.env.JOLCHU_MOCK_ROAD_DISTANCE_FACTOR);
  return Number.isFinite(raw) && raw > 0 ? raw : 1.3;
}

/** Average assumed road speed (km/h) used only by the mock route provider to
 * derive a deterministic duration — never presented as real traffic data. */
export function getMockAverageSpeedKmh(): number {
  const raw = Number(process.env.JOLCHU_MOCK_AVERAGE_SPEED_KMH);
  return Number.isFinite(raw) && raw > 0 ? raw : 55;
}
