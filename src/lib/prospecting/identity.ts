// Cross-contragent contact identity (master spec s.4/s.14 dedup + opt-out
// requirements). Deliberately NOT a new identity store: this is a pure
// function that turns whatever contact data a sighting already carries into
// one normalized fingerprint string, reusing the exact phone/handle
// normalization SCOUT already relies on (src/lib/agents/scout.ts) so a phone
// number that looks the same to a human looks the same to every contragent.
// The fingerprint itself is only ever *stored* on AcquisitionOutreachEvent
// and ProspectHandoff rows that already exist for other reasons — see
// src/lib/acquisition/outreach-log.ts's isDoNotContactFingerprint.
import { normalizePhone, normalizeTelegramUsername } from "@/lib/agents/scout";

export interface ContactIdentityInput {
  phone?: string | null;
  telegramUsername?: string | null;
}

/** Phone wins over Telegram handle when both are present: a phone number is
 * the more stable, harder-to-fake identity signal across RT's contragents
 * (a person keeps one phone number across passenger/driver/delivery/cargo
 * personas far more reliably than one Telegram handle). Returns null when
 * neither signal normalizes to anything usable — callers must treat a null
 * fingerprint as "no cross-type dedup possible for this sighting", never as
 * an error. */
export function computeContactFingerprint(input: ContactIdentityInput): string | null {
  const phone = normalizePhone(input.phone);
  if (phone) return `phone:${phone}`;
  const handle = normalizeTelegramUsername(input.telegramUsername);
  if (handle) return `tg:${handle}`;
  return null;
}
