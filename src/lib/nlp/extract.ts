// Trip extraction — the single entry point ingest.ts calls.
//
// The model prompt that used to live here now sits behind a provider
// (./providers), so extraction can run deterministically with no credentials
// and no spend. This file keeps what is genuinely not provider-specific: the
// contract, and resolving the returned stop keys back to real Stop rows.
import { getTripExtractionProvider } from "./providers";
import type { ExtractionResult, MessageHint, StopContext } from "./providers/types";

export type { ExtractionResult, MessageHint, StopContext } from "./providers/types";

export interface ExtractedStops {
  origin: StopContext | null;
  destination: StopContext | null;
}

/** A provider may only name a stop from the list it was given. Anything else
 * resolves to null rather than being trusted — the constraint the prompt
 * states is enforced here too, because a prompt is a request and this is a
 * check. */
function resolveStop(key: string | null, stops: StopContext[]): StopContext | null {
  if (!key) return null;
  return stops.find((s) => s.key === key) ?? null;
}

/**
 * Parse a free-text WhatsApp/Telegram message (ru/ky/en) into a structured
 * trip request or driver offer draft, constrained to the known corridor stops.
 * Never invents stops outside the provided list, and never extracts phone
 * numbers from the message body (contacts are handled out-of-band).
 */
export async function extractTripMessage(params: {
  text: string;
  stops: StopContext[];
  hint?: MessageHint;
  today: Date;
}): Promise<{ result: ExtractionResult; origin: StopContext | null; destination: StopContext | null }> {
  const { text, stops, hint = "UNKNOWN", today } = params;

  const result = await getTripExtractionProvider().extract({ text, stops, hint, today });

  return {
    result,
    origin: resolveStop(result.originStopKey, stops),
    destination: resolveStop(result.destinationStopKey, stops),
  };
}
