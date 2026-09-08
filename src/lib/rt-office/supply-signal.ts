// RT OFFICE's only write path, and it is a THIN one: re-triggering RT
// Core's existing MATCH agent (src/lib/agents/match.ts, which itself just
// wraps matching/orchestrate.ts). RT OFFICE never creates a Match, never
// touches DriverOffer.seatsAvailable, and never messages anyone directly —
// see boundary.test.ts, which statically forbids all of that. This exists
// for the "RT OFFICE detects supply ... informs RT Core" half of the spec's
// core loop, for callers outside the already-automatic ingest.ts path
// (e.g. a future explicit "I still have seats" driver report channel).
import { db } from "@/lib/db";
import { rootContext, logAgentAction } from "@/lib/agents/trace";
import { matchOffer } from "@/lib/agents/match";
import type { SupplyAvailableOutcome, SupplyAvailableSignal } from "./types";

export async function reportSupplyAvailable(signal: SupplyAvailableSignal): Promise<SupplyAvailableOutcome> {
  const offer = await db.driverOffer.findUnique({ where: { id: signal.offerId } });
  if (!offer || (offer.status !== "OPEN" && offer.status !== "PARTIALLY_FILLED")) {
    return { offerId: signal.offerId, rematchTriggered: false, matchId: null };
  }

  const ctx = rootContext();
  const match = await matchOffer(ctx, signal.offerId);

  await logAgentAction({
    ctx,
    agent: "RT_OFFICE",
    action: "rt_office.supply_reported",
    entityType: "DriverOffer",
    entityId: signal.offerId,
    details: { reportedBy: signal.reportedBy, matchId: match?.id ?? null },
  });

  return { offerId: signal.offerId, rematchTriggered: !!match, matchId: match?.id ?? null };
}
