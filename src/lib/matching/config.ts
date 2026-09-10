// Matching policy knobs, read lazily from env so nothing throws at import
// time and every value has a safe, documented default (mirrors
// src/lib/jolchu/config.ts's pattern). Purely response-window policy — not
// commercial/pricing logic.

/** How long a driver has to accept/decline a proposed request before the
 * match is expired and offered to the next candidate driver. */
export function getDriverResponseTimeoutMinutes(): number {
  const raw = Number(process.env.MATCH_DRIVER_RESPONSE_TIMEOUT_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
}

/** How long a passenger has to confirm/decline a driver who already
 * accepted before the match is expired and the request goes back to
 * PENDING for re-matching. */
export function getPassengerResponseTimeoutMinutes(): number {
  const raw = Number(process.env.MATCH_PASSENGER_RESPONSE_TIMEOUT_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
}
