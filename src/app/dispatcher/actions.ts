"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { completeTrip, proposeMatchesForRequest, handleDriverResponse, handlePassengerResponse } from "@/lib/matching/orchestrate";

async function currentDispatcher() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function verifyDriverAction(driverId: string) {
  const dispatcher = await currentDispatcher();
  await db.driver.update({
    where: { id: driverId },
    data: { status: "ACTIVE", verifiedAt: new Date(), verifiedByAdminId: dispatcher.username },
  });
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "driver.verified",
    entityType: "Driver",
    entityId: driverId,
  });
  revalidatePath("/dispatcher");
}

export async function blockDriverAction(driverId: string) {
  const dispatcher = await currentDispatcher();
  await db.driver.update({ where: { id: driverId }, data: { status: "BLOCKED" } });
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "driver.blocked",
    entityType: "Driver",
    entityId: driverId,
  });
  revalidatePath("/dispatcher");
}

export async function manualProposeAction(requestId: string) {
  const dispatcher = await currentDispatcher();
  const match = await proposeMatchesForRequest(requestId);
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.manual_propose",
    entityType: "TripRequest",
    entityId: requestId,
    details: { matchId: match?.id ?? null },
  });
  revalidatePath("/dispatcher");
}

export async function dispatcherOverrideDriverResponseAction(matchId: string, accepted: boolean) {
  const dispatcher = await currentDispatcher();
  await handleDriverResponse(matchId, accepted);
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.override_driver_response",
    entityType: "Match",
    entityId: matchId,
    details: { accepted },
  });
  revalidatePath("/dispatcher");
}

export async function dispatcherOverridePassengerResponseAction(matchId: string, accepted: boolean) {
  const dispatcher = await currentDispatcher();
  await handlePassengerResponse(matchId, accepted);
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.override_passenger_response",
    entityType: "Match",
    entityId: matchId,
    details: { accepted },
  });
  revalidatePath("/dispatcher");
}

export async function manualCompleteTripAction(tripId: string) {
  const dispatcher = await currentDispatcher();
  await completeTrip(tripId);
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.manual_complete_trip",
    entityType: "Trip",
    entityId: tripId,
  });
  revalidatePath("/dispatcher");
}

export async function cancelMatchAction(matchId: string, reason: string) {
  const dispatcher = await currentDispatcher();
  await db.match.update({ where: { id: matchId }, data: { status: "CANCELLED", declineReason: reason } });
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.cancel_match",
    entityType: "Match",
    entityId: matchId,
    details: { reason },
  });
  revalidatePath("/dispatcher");
}
