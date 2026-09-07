import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ACCOUNTANT_CASE_TYPE_LABEL_RU, ACCOUNTANT_CASE_STATUS_LABEL_RU, TREASURY_DEPARTMENT_LABEL_RU } from "@/lib/tyyin/labels";
import { recordAccountantResolutionAction, closeAccountantCaseAction } from "../../../tyyin-actions";

export const dynamic = "force-dynamic";

// Every action here re-checks the accountant/admin role server-side in
// tyyin-actions.ts / src/lib/tyyin/accountant.ts — this page shows the
// forms to everyone and lets the server reject an unauthorized submit
// (spec s.28: enforce server-side, not via UI).
export default async function AccountantCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kase = await db.accountantCase.findUnique({ where: { id }, include: { transaction: true } });
  if (!kase) notFound();

  return (
    <div className="space-y-4">
      <Link href="/dispatcher/tyyin" className="text-sm text-neutral-400 hover:text-neutral-100">
        ← Тыйын
      </Link>

      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{ACCOUNTANT_CASE_TYPE_LABEL_RU[kase.caseType]}</h2>
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">{ACCOUNTANT_CASE_STATUS_LABEL_RU[kase.status]}</span>
        </div>
        <p className="mt-2 text-neutral-300">{kase.summary}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-500 sm:grid-cols-4">
          <div>Отдел: {TREASURY_DEPARTMENT_LABEL_RU[kase.department]}</div>
          {kase.amountSom != null && (
            <div>
              Сумма: {kase.amountSom} {kase.currency}
            </div>
          )}
          {kase.relatedPaymentId && <div>Платёж: {kase.relatedPaymentId}</div>}
          {kase.relatedTransactionId && <div>Транзакция: {kase.relatedTransactionId}</div>}
          <div>Открыто: {kase.openedAt.toLocaleString("ru-RU")}</div>
        </div>
        {kase.transaction && (
          <div className="mt-2 text-xs text-neutral-500">
            Банковская транзакция: {kase.transaction.externalTransactionId} · {kase.transaction.amountSom} {kase.transaction.currency}
          </div>
        )}
        {kase.resolutionSummary && (
          <div className="mt-3 rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-300">
            <div className="font-medium text-neutral-400">Решение бухгалтера ({kase.resolutionType}):</div>
            {kase.resolutionSummary}
          </div>
        )}
      </div>

      {kase.status !== "RESOLVED" && kase.status !== "CLOSED" && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-neutral-300">Записать решение бухгалтера</h3>
          <p className="mb-2 text-xs text-neutral-500">
            Здесь фиксируется, что бухгалтер уже сделал вне этой системы (например, отправил возврат через банк-клиент) — Тыйын не выполняет это действие сам.
          </p>
          <form action={recordAccountantResolutionAction.bind(null, kase.id)} className="grid grid-cols-1 gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm sm:grid-cols-2">
            <input name="resolutionType" placeholder="Тип решения (напр. REFUND_SENT)" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
            <input name="resolutionSummary" placeholder="Что сделано" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
            <button type="submit" className="rounded bg-green-900 px-3 py-1.5 text-xs font-medium text-green-200 hover:bg-green-800 sm:col-span-2 sm:w-fit">
              Записать решение
            </button>
          </form>
        </section>
      )}

      {kase.status !== "CLOSED" && (
        <form action={closeAccountantCaseAction.bind(null, kase.id)}>
          <button type="submit" className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700">
            Закрыть дело
          </button>
        </form>
      )}
    </div>
  );
}
