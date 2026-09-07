import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DISCREPANCY_FLAGS } from "@/lib/sapargul/types";
import { DISCREPANCY_FLAG_LABEL_RU, PAYMENT_STATUS_LABEL_RU, PRELIMINARY_CHECK_LABEL_RU, TREASURY_REVIEW_LABEL_RU } from "@/lib/sapargul/labels";
import { submitPaymentEvidenceAction, flagPaymentDiscrepancyAction } from "../../../../sapargul-actions";

export const dynamic = "force-dynamic";

const EVIDENCE_TYPES = ["RECEIPT_IMAGE", "RECEIPT_PDF", "SCREENSHOT", "TRANSACTION_REFERENCE", "TEXT_STATEMENT"] as const;

const EVIDENCE_ACCEPTABLE_STATUSES = ["AWAITING_PAYMENT", "PAYMENT_MISMATCH"];

export default async function SapargulPaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = await db.shipmentPayment.findUnique({
    where: { id },
    include: { shipment: { select: { id: true, publicId: true, senderContact: true } }, destination: true },
  });
  if (!payment) notFound();

  const canSubmitEvidence = EVIDENCE_ACCEPTABLE_STATUSES.includes(payment.status);

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/dispatcher/finance/sapargul" className="text-sm text-neutral-400 hover:text-neutral-100">
          ← Все платежи
        </Link>
      </div>

      <h2 className="text-base font-semibold">Платёж {payment.orderReference}</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Заявка{" "}
        <Link href={`/dispatcher/sapar/${payment.shipment.id}`} className="hover:underline">
          {payment.shipment.publicId}
        </Link>{" "}
        · Клиент: {payment.shipment.senderContact}
      </p>

      <div className="mt-4 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
        <div>Статус: {PAYMENT_STATUS_LABEL_RU[payment.status]}</div>
        <div>Ожидается: {payment.amountExpectedSom} {payment.currency}</div>
        {payment.destination && (
          <div>
            Реквизиты: {payment.destination.label} ({payment.destination.method}){payment.destination.environment === "SANDBOX" && " — тестовый режим"}
          </div>
        )}
        {payment.claimedAmountSom != null && (
          <div>
            Клиент указал: {payment.claimedAmountSom} {payment.claimedCurrency ?? payment.currency}
            {payment.transactionReference && <> · транзакция: {payment.transactionReference}</>}
          </div>
        )}
        <div>Предварительная сверка: {PRELIMINARY_CHECK_LABEL_RU[payment.preliminaryCheckStatus]}</div>
        {payment.preliminaryCheckNotes && <div className="text-neutral-400">{payment.preliminaryCheckNotes}</div>}
        {payment.discrepancyFlags.length > 0 && (
          <div className="text-amber-300">Расхождения: {payment.discrepancyFlags.map((f) => DISCREPANCY_FLAG_LABEL_RU[f as keyof typeof DISCREPANCY_FLAG_LABEL_RU] ?? f).join(", ")}</div>
        )}
        <div>Казначей: {TREASURY_REVIEW_LABEL_RU[payment.treasuryReviewStatus]}</div>
        {payment.treasuryReviewerId && (
          <div className="text-neutral-400">
            Проверил: {payment.treasuryReviewerId} {payment.treasuryReviewedAt && `(${payment.treasuryReviewedAt.toLocaleString("ru-RU")})`}
          </div>
        )}
        {payment.rejectionReason && <div className="text-red-300">Причина отклонения: {payment.rejectionReason}</div>}
        {payment.mismatchReason && <div className="text-red-300">Причина расхождения: {payment.mismatchReason}</div>}
      </div>

      {canSubmitEvidence && (
        <form action={submitPaymentEvidenceAction.bind(null, payment.id)} className="mt-4 space-y-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
          <div className="font-medium">Записать квитанцию клиента (это доказательство, не подтверждение оплаты)</div>
          <select name="evidenceType" className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1" required>
            {EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input name="evidenceReference" placeholder="Ссылка/описание квитанции" className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1" required />
          <input name="claimedAmountSom" type="number" placeholder="Указанная клиентом сумма (сом)" className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="claimedCurrency" placeholder="Валюта (по умолчанию KGS)" className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="claimedPaymentTime" type="datetime-local" className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="transactionReference" placeholder="Номер транзакции (если есть)" className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <button type="submit" className="rounded bg-blue-900 px-2 py-1 text-xs font-medium text-blue-200 hover:bg-blue-800">
            Записать доказательство
          </button>
        </form>
      )}

      <form action={flagPaymentDiscrepancyAction.bind(null, payment.id)} className="mt-4 space-y-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
        <div className="font-medium">Отметить расхождение вручную</div>
        <select name="flag" className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1" required>
          {DISCREPANCY_FLAGS.map((f) => (
            <option key={f} value={f}>
              {DISCREPANCY_FLAG_LABEL_RU[f]}
            </option>
          ))}
        </select>
        <input name="note" placeholder="Комментарий (необязательно)" className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
        <button type="submit" className="rounded bg-amber-900 px-2 py-1 text-xs font-medium text-amber-200 hover:bg-amber-800">
          Отметить
        </button>
      </form>
    </div>
  );
}
