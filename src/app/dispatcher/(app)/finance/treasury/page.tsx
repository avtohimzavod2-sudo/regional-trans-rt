import Link from "next/link";
import { db } from "@/lib/db";
import { PAYMENT_STATUS_LABEL_RU, PRELIMINARY_CHECK_LABEL_RU, DISCREPANCY_FLAG_LABEL_RU } from "@/lib/sapargul/labels";
import { confirmActualPaymentReceiptAction, rejectPaymentAction, markPaymentMismatchAction } from "../../../sapargul-actions";

export const dynamic = "force-dynamic";

// Minimal, safe review surface (AGENTS Sapargul spec s.32) — only what the
// head treasurer needs to make the ACTUAL confirm/reject call. Every button
// here re-checks the treasurer/admin role server-side in
// sapargul-actions.ts; this page does not attempt to hide them from other
// roles, since that would be a false sense of security (spec s.28: enforce
// server-side, not via UI).
export default async function TreasuryReviewPage() {
  const payments = await db.shipmentPayment.findMany({
    where: { status: { in: ["AWAITING_TREASURER_CONFIRMATION", "PAYMENT_MISMATCH"] } },
    include: { shipment: { select: { publicId: true, senderContact: true } }, destination: true },
    orderBy: { updatedAt: "asc" },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Казначей — подтверждение поступления денег ({payments.length})</h2>
        <Link href="/dispatcher/finance/sapargul" className="text-sm text-neutral-400 hover:text-neutral-100">
          Все платежи Сапаргуль
        </Link>
      </div>

      <div className="space-y-3">
        {payments.map((p) => (
          <div key={p.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {p.orderReference} · заявка {p.shipment.publicId}
              </span>
              <span className="rounded bg-amber-950 px-2 py-0.5 text-xs text-amber-300">{PAYMENT_STATUS_LABEL_RU[p.status]}</span>
            </div>
            <div className="mt-1 text-neutral-300">
              Ожидается: {p.amountExpectedSom} {p.currency}
              {p.claimedAmountSom != null && (
                <>
                  {" "}
                  · Клиент указал: {p.claimedAmountSom} {p.claimedCurrency ?? p.currency}
                </>
              )}
              {p.destination && (
                <>
                  {" "}
                  · Реквизиты: {p.destination.label}
                  {p.destination.environment === "SANDBOX" && " (тест)"}
                </>
              )}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Проверка Сапаргуль: {PRELIMINARY_CHECK_LABEL_RU[p.preliminaryCheckStatus]}
              {p.preliminaryCheckNotes && <> — {p.preliminaryCheckNotes}</>}
            </div>
            {p.discrepancyFlags.length > 0 && (
              <div className="mt-1 text-xs text-amber-300">Расхождения: {p.discrepancyFlags.map((f) => DISCREPANCY_FLAG_LABEL_RU[f as keyof typeof DISCREPANCY_FLAG_LABEL_RU] ?? f).join(", ")}</div>
            )}

            <div className="mt-3 flex flex-wrap items-start gap-3">
              <form action={confirmActualPaymentReceiptAction.bind(null, p.id)} className="flex items-center gap-2">
                <input name="actualAmountSom" type="number" placeholder="Фактически поступило (сом)" required className="w-40 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs" />
                <input name="transactionReference" placeholder="Номер транзакции (опц.)" className="w-40 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs" />
                <button type="submit" className="rounded bg-green-900 px-2 py-1 text-xs font-medium text-green-200 hover:bg-green-800">
                  Подтвердить поступление
                </button>
              </form>
              <form action={markPaymentMismatchAction.bind(null, p.id)} className="flex items-center gap-2">
                <input name="reason" placeholder="Причина расхождения" required className="w-48 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs" />
                <button type="submit" className="rounded bg-amber-900 px-2 py-1 text-xs font-medium text-amber-200 hover:bg-amber-800">
                  Расхождение
                </button>
              </form>
              <form action={rejectPaymentAction.bind(null, p.id)} className="flex items-center gap-2">
                <input name="reason" placeholder="Причина отклонения" required className="w-48 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs" />
                <button type="submit" className="rounded bg-red-950 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-900">
                  Отклонить
                </button>
              </form>
            </div>
          </div>
        ))}
        {payments.length === 0 && <p className="text-sm text-neutral-500">Нет платежей, ожидающих решения казначея.</p>}
      </div>
    </div>
  );
}
