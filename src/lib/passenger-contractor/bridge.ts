// Read + conversion-write access point for other modules — PassengerProspect
// stays PASSENGER_CONTRACTOR's exclusive write surface, so anything outside
// this directory that needs to record a conversion (e.g. a future
// TripRequest<->prospect matching pass) calls markPassengerProspectConverted
// here rather than touching db.passengerProspect directly.
import { db } from "@/lib/db";
import { markProspectConverted } from "./prospect";

/** Recent passenger-acquisition outreach attempts, most recent first — feeds
 * the dispatcher's Market Acquisition dashboard. */
export async function recentPassengerAcquisitionOutreach(limit = 50) {
  return db.acquisitionOutreachEvent.findMany({
    where: { prospectType: "PASSENGER", contractorAgent: "PASSENGER_CONTRACTOR" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Passenger prospects still awaiting a dispatcher/outreach decision. */
export async function activePassengerProspects(limit = 50) {
  return db.passengerProspect.findMany({
    where: { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Records that a prospect became a real passenger via Mira — the only
 * legitimate way a PassengerProspect ever reaches CONVERTED. Never inferred
 * here: the caller must already hold a real TripRequestId. */
export async function markPassengerProspectConverted(prospectId: string, tripRequestId: string) {
  return markProspectConverted(prospectId, tripRequestId);
}
