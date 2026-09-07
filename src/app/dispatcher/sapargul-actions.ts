"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { PaymentEvidenceType } from "@prisma/client";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { rootContext } from "@/lib/agents/trace";
import { submitPaymentEvidence } from "@/lib/sapargul/payment";
import { confirmActualPaymentReceipt, rejectPayment, markPaymentMismatch } from "@/lib/sapargul/treasury";
import type { DiscrepancyFlag } from "@/lib/sapargul/types";

async function currentDispatcher() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session) throw new Error("Not authenticated");
  return session;
}

// Sapargul-level action: any authenticated dispatcher may record evidence a
// client sent in (AGENTS Sapargul spec s.27) — never a confirmation, only
// ever lands the payment at AWAITING_TREASURER_CONFIRMATION.
export async function submitPaymentEvidenceAction(paymentId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const evidenceType = String(formData.get("evidenceType") ?? "") as PaymentEvidenceType;
  const evidenceReference = String(formData.get("evidenceReference") ?? "").trim();
  if (!evidenceType || !evidenceReference) throw new Error("evidenceType and evidenceReference are required");

  const claimedAmountRaw = String(formData.get("claimedAmountSom") ?? "").trim();
  const claimedCurrency = String(formData.get("claimedCurrency") ?? "").trim() || null;
  const claimedPaymentTimeRaw = String(formData.get("claimedPaymentTime") ?? "").trim();
  const transactionReference = String(formData.get("transactionReference") ?? "").trim() || null;

  const payment = await submitPaymentEvidence(rootContext(), paymentId, {
    evidenceType,
    evidenceReference,
    claimedAmountSom: claimedAmountRaw ? Number(claimedAmountRaw) : null,
    claimedCurrency,
    claimedPaymentTime: claimedPaymentTimeRaw ? new Date(claimedPaymentTimeRaw) : null,
    transactionReference,
  });

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.payment_evidence_recorded",
    entityType: "ShipmentPayment",
    entityId: paymentId,
    details: { evidenceType, preliminaryCheckStatus: payment.preliminaryCheckStatus },
  });
  revalidatePath("/dispatcher/finance/sapargul");
  revalidatePath(`/dispatcher/finance/sapargul/${paymentId}`);
  revalidatePath("/dispatcher/finance/treasury");
}

// Sapargul-level action: manually flag a payment for closer attention
// without touching its status (e.g. a dispatcher notices something odd
// before formal evidence arrives).
export async function flagPaymentDiscrepancyAction(paymentId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const flag = String(formData.get("flag") ?? "") as DiscrepancyFlag;
  const note = String(formData.get("note") ?? "").trim();
  if (!flag) throw new Error("a discrepancy flag is required");

  const payment = await db.shipmentPayment.findUniqueOrThrow({ where: { id: paymentId } });
  const discrepancyFlags = payment.discrepancyFlags.includes(flag) ? payment.discrepancyFlags : [...payment.discrepancyFlags, flag];
  await db.shipmentPayment.update({
    where: { id: paymentId },
    data: { discrepancyFlags, preliminaryCheckNotes: note ? `${payment.preliminaryCheckNotes ?? ""} [${dispatcher.username}] ${note}`.trim() : payment.preliminaryCheckNotes },
  });

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.payment_discrepancy_flagged",
    entityType: "ShipmentPayment",
    entityId: paymentId,
    details: { flag, note: note || null },
  });
  revalidatePath("/dispatcher/finance/sapargul");
  revalidatePath(`/dispatcher/finance/sapargul/${paymentId}`);
}

// Treasury-only actions below — confirmActualPaymentReceipt/rejectPayment/
// markPaymentMismatch all re-check the role themselves (defense in depth,
// AGENTS Sapargul spec s.27/s.28); currentDispatcher().role is passed
// through rather than trusted from the client.

export async function confirmActualPaymentReceiptAction(paymentId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const actualAmountRaw = String(formData.get("actualAmountSom") ?? "").trim();
  const actualAmountSom = Number(actualAmountRaw);
  if (!actualAmountRaw || Number.isNaN(actualAmountSom)) throw new Error("actualAmountSom is required");
  const transactionReference = String(formData.get("transactionReference") ?? "").trim() || null;

  await confirmActualPaymentReceipt(rootContext(), dispatcher.role, paymentId, {
    actualAmountSom,
    transactionReference,
    reviewerId: dispatcher.username,
  });

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.treasury_confirmed_receipt",
    entityType: "ShipmentPayment",
    entityId: paymentId,
    details: { actualAmountSom, transactionReference },
  });
  revalidatePath("/dispatcher/finance/treasury");
  revalidatePath("/dispatcher/finance/sapargul");
  revalidatePath(`/dispatcher/finance/sapargul/${paymentId}`);
  revalidatePath("/dispatcher/sapar");
}

export async function rejectPaymentAction(paymentId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("a rejection reason is required");

  await rejectPayment(rootContext(), dispatcher.role, paymentId, { reason, reviewerId: dispatcher.username });

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.treasury_rejected_payment",
    entityType: "ShipmentPayment",
    entityId: paymentId,
    details: { reason },
  });
  revalidatePath("/dispatcher/finance/treasury");
  revalidatePath("/dispatcher/finance/sapargul");
  revalidatePath(`/dispatcher/finance/sapargul/${paymentId}`);
}

export async function markPaymentMismatchAction(paymentId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("a mismatch reason is required");

  await markPaymentMismatch(rootContext(), dispatcher.role, paymentId, { reason, reviewerId: dispatcher.username });

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.treasury_marked_mismatch",
    entityType: "ShipmentPayment",
    entityId: paymentId,
    details: { reason },
  });
  revalidatePath("/dispatcher/finance/treasury");
  revalidatePath("/dispatcher/finance/sapargul");
  revalidatePath(`/dispatcher/finance/sapargul/${paymentId}`);
}
