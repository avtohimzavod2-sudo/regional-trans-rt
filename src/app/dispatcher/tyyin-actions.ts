"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { TreasuryDepartment } from "@prisma/client";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { rootContext } from "@/lib/agents/trace";
import { logAction } from "@/lib/audit";
import { ingestBankTransaction, reconcileAllPending, runReconciliationForTransaction } from "@/lib/tyyin/ingestion";
import { recordAccountantResolution, closeAccountantCase } from "@/lib/tyyin/accountant";
import { requireTreasuryOpsRole } from "@/lib/tyyin/role";
import { currentTreasuryEnvironment } from "@/lib/tyyin/sandbox-adapter";

async function currentDispatcher() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  if (!session) throw new Error("Not authenticated");
  return session;
}

// SANDBOX-only (AGENTS Tyyin spec s.7/s.27/s.60): the only honest way a
// transaction "arrives" in this build — never a fabricated feed, always an
// explicit, role-gated, audited dispatcher action. Refuses outright if the
// environment is ever configured as PRODUCTION, since no real banking
// integration exists to actually receive a transaction from.
export async function simulateIncomingTransactionAction(formData: FormData) {
  const dispatcher = await currentDispatcher();
  requireTreasuryOpsRole(dispatcher.role);
  if (currentTreasuryEnvironment() !== "SANDBOX") throw new Error("Simulating an incoming transaction is only allowed in the SANDBOX environment");

  const externalTransactionId = String(formData.get("externalTransactionId") ?? "").trim();
  const accountRef = String(formData.get("accountRef") ?? "").trim();
  const amountRaw = String(formData.get("amountSom") ?? "").trim();
  const amountSom = Number(amountRaw);
  const currency = String(formData.get("currency") ?? "KGS").trim() || "KGS";
  const paymentReference = String(formData.get("paymentReference") ?? "").trim() || null;
  const counterpartyMasked = String(formData.get("counterpartyMasked") ?? "").trim() || null;
  const department = (String(formData.get("department") ?? "CARGO").trim() || "CARGO") as TreasuryDepartment;
  if (!externalTransactionId || !accountRef || !amountRaw || Number.isNaN(amountSom)) {
    throw new Error("externalTransactionId, accountRef, and amountSom are required");
  }

  const transaction = await ingestBankTransaction(
    rootContext(),
    { externalTransactionId, accountRef, amountSom, currency, paymentReference, counterpartyMasked, transactionTime: new Date() },
    department,
  );

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.tyyin_transaction_simulated",
    entityType: "TreasuryTransaction",
    entityId: transaction.id,
    details: { externalTransactionId, amountSom, status: transaction.status },
  });
  revalidatePath("/dispatcher/tyyin");
}

export async function reconcileAllPendingAction() {
  const dispatcher = await currentDispatcher();
  requireTreasuryOpsRole(dispatcher.role);

  const processed = await reconcileAllPending(rootContext());

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.tyyin_bulk_reconciliation_triggered",
    entityType: "TreasuryTransaction",
    entityId: "BULK",
    details: { processed },
  });
  revalidatePath("/dispatcher/tyyin");
}

export async function reconcileOneTransactionAction(transactionId: string) {
  const dispatcher = await currentDispatcher();
  requireTreasuryOpsRole(dispatcher.role);

  const updated = await runReconciliationForTransaction(rootContext(), transactionId);

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.tyyin_reconciliation_retried",
    entityType: "TreasuryTransaction",
    entityId: transactionId,
    details: { status: updated.status },
  });
  revalidatePath("/dispatcher/tyyin");
}

// Accountant-only (AGENTS Tyyin spec s.24): records what the accountant
// reports they already did outside this system — recordAccountantResolution
// itself re-checks the role server-side (defense in depth).
export async function recordAccountantResolutionAction(caseId: string, formData: FormData) {
  const dispatcher = await currentDispatcher();
  const resolutionType = String(formData.get("resolutionType") ?? "").trim();
  const resolutionSummary = String(formData.get("resolutionSummary") ?? "").trim();
  if (!resolutionType || !resolutionSummary) throw new Error("resolutionType and resolutionSummary are required");

  await recordAccountantResolution(rootContext(), dispatcher.role, caseId, { resolutionType, resolutionSummary, recordedById: dispatcher.username });

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.tyyin_accountant_case_resolved",
    entityType: "AccountantCase",
    entityId: caseId,
    details: { resolutionType },
  });
  revalidatePath("/dispatcher/tyyin");
  revalidatePath(`/dispatcher/tyyin/${caseId}`);
}

export async function closeAccountantCaseAction(caseId: string) {
  const dispatcher = await currentDispatcher();
  await closeAccountantCase(rootContext(), dispatcher.role, caseId, dispatcher.username);

  await logAction({
    actorType: "DISPATCHER",
    actorId: dispatcher.username,
    action: "dispatcher.tyyin_accountant_case_closed",
    entityType: "AccountantCase",
    entityId: caseId,
  });
  revalidatePath("/dispatcher/tyyin");
  revalidatePath(`/dispatcher/tyyin/${caseId}`);
}
