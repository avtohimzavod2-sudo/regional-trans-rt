"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { DeliveryExecutorStatus, DriverCategory, LedgerEntryType, ParcelStatus, ShipmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { completeTrip, proposeMatchesForRequest, handleDriverResponse, handlePassengerResponse } from "@/lib/matching/orchestrate";
import { rootContext } from "@/lib/agents/trace";
import { reviewScoutCandidate } from "@/lib/agents/scout";
import { adjustBalance } from "@/lib/agents/pay";
import { transitionParcel } from "@/lib/agents/parcel";
import { resolveSupportCase } from "@/lib/agents/support";
import { transitionShipment } from "@/lib/sapar/lifecycle";
import { resolveShipmentIncident } from "@/lib/sapar/incidents";

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

// --- RT Scout: candidate review ---

export async function scoutLinkAction(candidateId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const driverId = String(formData.get("driverId") ?? "").trim();
  if (!driverId) throw new Error("driverId is required to link a scout candidate");
  await reviewScoutCandidate(rootContext(), candidateId, { action: "LINK", driverId }, dispatcher.username);
  revalidatePath("/dispatcher/scout");
}

export async function scoutRejectAction(candidateId: string) {
  const dispatcher = await currentDispatcher();
  await reviewScoutCandidate(rootContext(), candidateId, { action: "REJECT" }, dispatcher.username);
  revalidatePath("/dispatcher/scout");
}

export async function scoutCreateNewAction(candidateId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const telegramUserId = String(formData.get("telegramUserId") ?? "").trim();
  if (!telegramUserId) throw new Error("telegramUserId is required to create a new driver from a scout candidate");
  await reviewScoutCandidate(rootContext(), candidateId, { action: "CREATE_NEW", telegramUserId }, dispatcher.username);
  revalidatePath("/dispatcher/scout");
}

// --- Driver Intelligence: manual category override ---

export async function overrideDriverCategoryAction(driverId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const category = String(formData.get("category") ?? "") as DriverCategory;
  await db.driver.update({ where: { id: driverId }, data: { category } });
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.override_driver_category",
    entityType: "Driver",
    entityId: driverId,
    details: { category },
  });
  revalidatePath("/dispatcher/drivers");
}

// --- RT Balance / ledger ---

export async function ledgerAdjustAction(driverId: string, type: Extract<LedgerEntryType, "TOPUP" | "ADJUSTMENT">, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const rawAmount = Number(formData.get("amountSom"));
  if (!Number.isFinite(rawAmount) || rawAmount === 0) throw new Error("amountSom must be a non-zero number");
  const amountSom = type === "TOPUP" ? Math.abs(rawAmount) : rawAmount;
  const description = String(formData.get("description") ?? "") || undefined;
  await adjustBalance(rootContext(), driverId, amountSom, type, "DISPATCHER", dispatcher.username, description);
  revalidatePath("/dispatcher/ledger");
}

// --- Parcels ---

export async function parcelTransitionAction(parcelId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const to = String(formData.get("status") ?? "") as ParcelStatus;
  if (!to) throw new Error("target status is required");
  await transitionParcel(rootContext(), parcelId, to);
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.parcel_status_override",
    entityType: "Parcel",
    entityId: parcelId,
    details: { to },
  });
  revalidatePath("/dispatcher/parcels");
}

// --- Support cases ---

export async function resolveSupportCaseAction(caseId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const resolution = String(formData.get("resolution") ?? "").trim();
  if (!resolution) throw new Error("a resolution note is required");
  await resolveSupportCase(rootContext(), caseId, resolution);
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.support_case_resolved",
    entityType: "SupportCase",
    entityId: caseId,
    details: { resolution },
  });
  revalidatePath("/dispatcher/support");
}

// --- Sapar (cargo/parcel delivery) ---

export async function shipmentTransitionAction(shipmentId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const to = String(formData.get("status") ?? "") as ShipmentStatus;
  if (!to) throw new Error("target status is required");
  await transitionShipment(rootContext(), shipmentId, to);
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.shipment_status_override",
    entityType: "Shipment",
    entityId: shipmentId,
    details: { to },
  });
  revalidatePath("/dispatcher/sapar");
  revalidatePath(`/dispatcher/sapar/${shipmentId}`);
}

export async function resolveShipmentIncidentAction(incidentId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const resolution = String(formData.get("resolution") ?? "").trim();
  if (!resolution) throw new Error("a resolution note is required");
  await resolveShipmentIncident(rootContext(), incidentId, resolution);
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.shipment_incident_resolved",
    entityType: "ShipmentIncident",
    entityId: incidentId,
    details: { resolution },
  });
  revalidatePath("/dispatcher/sapar/incidents");
}

// Blacklist/suspend/reinstate an executor — always with an audit trail note,
// never a silent status flip (AGENTS spec s.19/s.20).
export async function setDeliveryExecutorStatusAction(executorId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const status = String(formData.get("status") ?? "") as DeliveryExecutorStatus;
  if (!status) throw new Error("target status is required");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  await db.deliveryExecutor.update({
    where: { id: executorId },
    data: {
      status,
      blacklistReason: status === "SUSPENDED" || status === "BLOCKED" ? reason : null,
      blacklistedAt: status === "SUSPENDED" || status === "BLOCKED" ? new Date() : null,
    },
  });
  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.delivery_executor_status_changed",
    entityType: "DeliveryExecutor",
    entityId: executorId,
    details: { status, reason },
  });
  revalidatePath("/dispatcher/sapar/executors");
}
