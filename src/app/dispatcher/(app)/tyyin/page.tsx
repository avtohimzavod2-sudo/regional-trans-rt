import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { rootContext } from "@/lib/agents/trace";
import { getOwnerFinancialStatus } from "@/lib/tyyin/owner";
import { isOwnerRole, isTreasuryOpsRole } from "@/lib/tyyin/role";
import { TREASURY_TRANSACTION_STATUS_LABEL_RU, TREASURY_DEPARTMENT_LABEL_RU, ACCOUNTANT_CASE_TYPE_LABEL_RU, ACCOUNTANT_CASE_STATUS_LABEL_RU } from "@/lib/tyyin/labels";
import { currentTreasuryEnvironment } from "@/lib/tyyin/sandbox-adapter";
import { simulateIncomingTransactionAction, reconcileAllPendingAction, reconcileOneTransactionAction } from "../../tyyin-actions";

export const dynamic = "force-dynamic";

// Tyyin's own dashboard — separate from Sapargul's human-treasurer
// "Казначей" review page (/dispatcher/finance/treasury). This page does not
// attempt to hide sections from a non-authorized role (spec s.28: enforce
// server-side, not via UI) — every action button re-checks its own role
// requirement inside tyyin-actions.ts.
export default async function TyyinDashboardPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  const [needsReconciliation, received, openCases, environment] = await Promise.all([
    db.treasuryTransaction.findMany({ where: { status: "NEEDS_MANUAL_RECONCILIATION" }, orderBy: { transactionTime: "desc" }, take: 50 }),
    db.treasuryTransaction.findMany({ where: { status: "RECEIVED" }, orderBy: { transactionTime: "desc" }, take: 50 }),
    db.accountantCase.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { openedAt: "desc" }, take: 50 }),
    Promise.resolve(currentTreasuryEnvironment()),
  ]);

  const ownerStatus = session && isOwnerRole(session.role) ? await getOwnerFinancialStatus(rootContext(), session.role, session.username).catch(() => null) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Тыйын — главный ИИ-казначей RT</h2>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">{environment === "SANDBOX" ? "Песочница" : "Продакшн"}</span>
      </div>

      {ownerStatus && (
        <section className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
          <h3 className="mb-2 text-sm font-semibold text-neutral-300">Статус для владельца (последние 24ч)</h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-neutral-300 sm:grid-cols-4">
            <div>Транзакций получено: {ownerStatus.last24h.transactionsReceived}</div>
            <div>Сверено: {ownerStatus.last24h.transactionsMatched}</div>
            <div>Сумма получена: {ownerStatus.last24h.totalReceivedSom} сом</div>
            <div>Сумма сверена: {ownerStatus.last24h.totalMatchedSom} сом</div>
            <div>Переплата: {ownerStatus.last24h.overpaymentSom} сом</div>
            <div>Открытых дел бухгалтера: {ownerStatus.openAccountantCases}</div>
            <div>Нужна ручная сверка: {ownerStatus.transactionsNeedingManualReconciliation}</div>
          </div>
        </section>
      )}

      {session && isTreasuryOpsRole(session.role) && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-neutral-300">Симулировать входящую транзакцию (только песочница)</h3>
          <form action={simulateIncomingTransactionAction} className="grid grid-cols-1 gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm sm:grid-cols-3">
            <input name="externalTransactionId" placeholder="ID транзакции банка" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
            <input name="accountRef" placeholder="Счёт (маскированный)" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
            <input name="amountSom" type="number" placeholder="Сумма (сом)" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
            <input name="currency" placeholder="Валюта" defaultValue="KGS" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
            <input name="paymentReference" placeholder="Номер заказа (payment reference)" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
            <input name="counterpartyMasked" placeholder="Отправитель (маскированный)" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
            <select name="department" defaultValue="CARGO" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1">
              <option value="CARGO">Грузоперевозки</option>
              <option value="PASSENGER">Пассажирские</option>
              <option value="OTHER">Прочее</option>
            </select>
            <button type="submit" className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white sm:col-span-3 sm:w-fit">
              Добавить транзакцию
            </button>
          </form>
          <form action={reconcileAllPendingAction} className="mt-2">
            <button type="submit" className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700">
              Пересверить все ожидающие
            </button>
          </form>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Нужна ручная сверка ({needsReconciliation.length})</h3>
        <div className="space-y-2">
          {needsReconciliation.map((t) => (
            <div key={t.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {t.externalTransactionId} · {t.amountSom} {t.currency}
                </span>
                <span className="rounded bg-amber-950 px-2 py-0.5 text-xs text-amber-300">{TREASURY_TRANSACTION_STATUS_LABEL_RU[t.status]}</span>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {TREASURY_DEPARTMENT_LABEL_RU[t.department]} · счёт {t.accountRef} · заявка {t.paymentReference ?? "—"}
              </div>
              {t.reconciliationNotes && <div className="mt-1 text-xs text-amber-300">{t.reconciliationNotes}</div>}
              <form action={reconcileOneTransactionAction.bind(null, t.id)} className="mt-2">
                <button type="submit" className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700">
                  Пересверить
                </button>
              </form>
            </div>
          ))}
          {needsReconciliation.length === 0 && <p className="text-sm text-neutral-500">Нет транзакций, ожидающих ручной сверки.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Получены, не сверены ({received.length})</h3>
        <div className="space-y-2">
          {received.map((t) => (
            <div key={t.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              {t.externalTransactionId} · {t.amountSom} {t.currency} · заявка {t.paymentReference ?? "—"}
            </div>
          ))}
          {received.length === 0 && <p className="text-sm text-neutral-500">Нет свежепоступивших транзакций.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Дела бухгалтера ({openCases.length})</h3>
        <div className="space-y-2">
          {openCases.map((c) => (
            <Link key={c.id} href={`/dispatcher/tyyin/${c.id}`} className="block rounded border border-neutral-800 bg-neutral-900 p-3 text-sm hover:border-neutral-700">
              <div className="flex items-center justify-between">
                <span className="font-medium">{ACCOUNTANT_CASE_TYPE_LABEL_RU[c.caseType]}</span>
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">{ACCOUNTANT_CASE_STATUS_LABEL_RU[c.status]}</span>
              </div>
              <div className="mt-1 text-neutral-300">{c.summary}</div>
              {c.amountSom != null && (
                <div className="mt-1 text-xs text-neutral-500">
                  {c.amountSom} {c.currency}
                </div>
              )}
            </Link>
          ))}
          {openCases.length === 0 && <p className="text-sm text-neutral-500">Нет открытых дел бухгалтера.</p>}
        </div>
      </section>
    </div>
  );
}

