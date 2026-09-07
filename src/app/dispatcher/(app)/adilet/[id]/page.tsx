import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  attachEvidenceAction,
  closeCaseAction,
  recordDecisionAction,
  requestAppealAction,
  resolveAppealAction,
} from "../../../adilet-actions";

export const dynamic = "force-dynamic";

export default async function AdiletCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const adiletCase = await db.adiletCase.findUnique({
    where: { id },
    include: {
      evidence: { orderBy: { occurredAt: "asc" } },
      decisions: { orderBy: { decidedAt: "asc" }, include: { sanction: true } },
      sanctions: { orderBy: { startAt: "asc" } },
      appeals: { orderBy: { createdAt: "asc" }, include: { decision: true, reviewDecision: true } },
    },
  });
  if (!adiletCase) notFound();

  const timeline = await db.auditLogEntry.findMany({
    where: { entityType: "AdiletCase", entityId: adiletCase.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const latestDecision = adiletCase.decisions[adiletCase.decisions.length - 1];
  const openAppeal = adiletCase.appeals.find((a) => a.status === "APPEAL_REQUESTED" || a.status === "UNDER_REVIEW");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dispatcher/adilet" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Адилет
        </Link>
        <h2 className="mt-1 text-base font-semibold">
          {adiletCase.caseType} · {adiletCase.severity} · {adiletCase.status}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">{adiletCase.summary}</p>
        <p className="mt-1 text-sm text-neutral-300">Претензия: {adiletCase.allegation}</p>
        <p className="mt-1 text-xs text-neutral-500">
          открыто {adiletCase.openedAt.toLocaleString("ru-RU")} · {adiletCase.openedByType}
          {adiletCase.openedById && <> ({adiletCase.openedById})</>}
          {adiletCase.sourceAgent && <> · источник: {adiletCase.sourceAgent}</>} · режим: {adiletCase.reviewMode}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {adiletCase.relatedUserId && <>клиент/водитель: {adiletCase.relatedUserId} · </>}
          {adiletCase.relatedExecutorId && <>исполнитель: {adiletCase.relatedExecutorId} · </>}
          {adiletCase.shipmentId && <>заявка: {adiletCase.shipmentId}</>}
        </p>
        {adiletCase.status !== "CLOSED" && (
          <form action={closeCaseAction.bind(null, adiletCase.id)} className="mt-3">
            <button type="submit" className="rounded bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700">
              Закрыть дело
            </button>
          </form>
        )}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Доказательства ({adiletCase.evidence.length})</h3>
        <div className="space-y-1">
          {adiletCase.evidence.map((e) => (
            <div key={e.id} className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300">
              {e.type} · {e.factStatus} · доверие: {e.trust} · источник: {e.source}
              {e.sourceId && <> ({e.sourceId})</>} · {e.occurredAt.toLocaleString("ru-RU")}
              <div className="mt-1 text-neutral-400">{e.description}</div>
            </div>
          ))}
          {adiletCase.evidence.length === 0 && <p className="text-xs text-neutral-500">Доказательств пока нет.</p>}
        </div>

        <form action={attachEvidenceAction.bind(null, adiletCase.id)} className="mt-3 grid grid-cols-1 gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm sm:grid-cols-2">
          <select name="type" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1">
            <option value="">Тип доказательства…</option>
            <option value="MESSAGE">MESSAGE</option>
            <option value="ORDER_EVENT">ORDER_EVENT</option>
            <option value="PAYMENT_EVENT">PAYMENT_EVENT</option>
            <option value="SHIPMENT_INCIDENT">SHIPMENT_INCIDENT</option>
            <option value="DRIVER_STATUS">DRIVER_STATUS</option>
            <option value="PROVIDER_RESPONSE">PROVIDER_RESPONSE</option>
            <option value="CUSTOMER_FEEDBACK">CUSTOMER_FEEDBACK</option>
            <option value="MANAGER_NOTE">MANAGER_NOTE</option>
            <option value="SYSTEM_LOG">SYSTEM_LOG</option>
            <option value="OTHER">OTHER</option>
          </select>
          <select name="factStatus" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1">
            <option value="">Статус факта…</option>
            <option value="CLAIM">CLAIM — заявление, не проверено</option>
            <option value="VERIFIED_FACT">VERIFIED_FACT — подтверждено</option>
            <option value="DISPUTED">DISPUTED — оспаривается</option>
          </select>
          <select name="trust" defaultValue="MEDIUM" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1">
            <option value="LOW">доверие: низкое</option>
            <option value="MEDIUM">доверие: среднее</option>
            <option value="HIGH">доверие: высокое</option>
          </select>
          <input name="source" placeholder="Источник (напр. AuditLogEntry, ShipmentIncident, manager)" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="occurredAt" type="datetime-local" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <textarea name="description" placeholder="Описание" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 sm:col-span-2" />
          <button type="submit" className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white sm:w-fit">
            Добавить доказательство
          </button>
        </form>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Решения ({adiletCase.decisions.length})</h3>
        <div className="space-y-2">
          {adiletCase.decisions.map((d) => (
            <div key={d.id} className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300">
              <div className="font-medium text-neutral-200">
                {d.outcome} · {d.decidedAt.toLocaleString("ru-RU")}
                {d.supersedesDecisionId && <> · пересмотр решения {d.supersedesDecisionId.slice(0, 8)}</>}
              </div>
              <div className="mt-1">Выводы: {d.findings}</div>
              <div className="mt-1">Основание политики: {d.policyBasis}</div>
              {d.proportionalityReason && <div className="mt-1">Соразмерность: {d.proportionalityReason}</div>}
              {d.verifiedFacts.length > 0 && <div className="mt-1">Подтверждённые факты: {d.verifiedFacts.join("; ")}</div>}
              {d.disputedFacts.length > 0 && <div className="mt-1">Оспариваемые факты: {d.disputedFacts.join("; ")}</div>}
              {d.sanction && (
                <div className="mt-1 text-amber-300">
                  Санкция: {d.sanction.subjectType} {d.sanction.subjectId} · {d.sanction.sanctionType} · {d.sanction.status}
                  {d.sanction.expiresAt && <> · до {d.sanction.expiresAt.toLocaleString("ru-RU")}</>}
                </div>
              )}
              {d.appealAllowed && !d.supersedesDecisionId && adiletCase.appeals.every((a) => a.decisionId !== d.id) && (
                <form action={requestAppealAction.bind(null, adiletCase.id, d.id)} className="mt-2 flex items-center gap-2">
                  <input name="requestReason" placeholder="Причина апелляции" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs" />
                  <button type="submit" className="rounded bg-purple-950 px-2 py-1 text-xs font-medium text-purple-300 hover:bg-purple-900">
                    Запросить апелляцию
                  </button>
                </form>
              )}
            </div>
          ))}
          {adiletCase.decisions.length === 0 && <p className="text-xs text-neutral-500">Решений пока нет.</p>}
        </div>

        {adiletCase.status !== "CLOSED" && (
          <form action={recordDecisionAction.bind(null, adiletCase.id)} className="mt-3 grid grid-cols-1 gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm sm:grid-cols-2">
            <p className="text-xs text-neutral-500 sm:col-span-2">
              Решение считается движком политики по накопленным доказательствам — ниже указываются только наблюдаемые сигналы, а не сам исход.
            </p>
            <select name="subjectType" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1">
              <option value="">Кто под разбором…</option>
              <option value="CLIENT">CLIENT</option>
              <option value="DRIVER">DRIVER</option>
              <option value="EXECUTOR">EXECUTOR</option>
            </select>
            <input name="subjectId" placeholder="ID субъекта" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
            <input name="findings" placeholder="Выводы по делу" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 sm:col-span-2" />
            <input name="policyBasis" placeholder="Основание политики (какое правило применяется)" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 sm:col-span-2" />
            <input name="priorWarningsCount" type="number" min="0" defaultValue="0" placeholder="Кол-во прошлых предупреждений" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
            <select name="rudenessSeverity" defaultValue="ORDINARY_FRUSTRATION" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1">
              <option value="ORDINARY_FRUSTRATION">тон: обычное раздражение</option>
              <option value="RUDE">тон: грубость</option>
              <option value="INSULT">тон: оскорбление</option>
              <option value="THREAT">тон: угроза</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-neutral-400">
              <input type="checkbox" name="continuedAfterWarning" /> продолжилось после предупреждения
            </label>
            <fieldset className="flex flex-wrap gap-3 text-xs text-neutral-400 sm:col-span-2">
              {[
                ["safetyThreat", "угроза безопасности"],
                ["violenceThreat", "угроза насилия"],
                ["confirmedFraud", "подтверждённое мошенничество"],
                ["dangerousDriving", "опасное вождение"],
                ["bypassOfFinancialOrSafetyControls", "обход контроля"],
                ["repeatedFakePaymentEvidence", "повторные фейковые платежи"],
                ["provenBadFaithDamageOrLoss", "доказанный ущерб/потеря"],
                ["systematicAbuse", "систематические злоупотребления"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-1">
                  <input type="checkbox" name={key} /> {label}
                </label>
              ))}
            </fieldset>
            <button type="submit" className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white sm:w-fit">
              Вынести решение
            </button>
          </form>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Санкции ({adiletCase.sanctions.length})</h3>
        <div className="space-y-1">
          {adiletCase.sanctions.map((s) => (
            <div key={s.id} className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300">
              {s.subjectType} {s.subjectId} · {s.sanctionType} · {s.status} · {s.reason}
              {s.expiresAt && <> · до {s.expiresAt.toLocaleString("ru-RU")}</>}
              {s.reversedAt && <> · отменено {s.reversedAt.toLocaleString("ru-RU")}: {s.reversedReason}</>}
            </div>
          ))}
          {adiletCase.sanctions.length === 0 && <p className="text-xs text-neutral-500">Санкций нет.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Апелляции ({adiletCase.appeals.length})</h3>
        <div className="space-y-2">
          {adiletCase.appeals.map((a) => (
            <div key={a.id} className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300">
              {a.status} · причина: {a.requestReason}
              {a.reviewNotes && <div className="mt-1">Заключение директора: {a.reviewNotes}</div>}
            </div>
          ))}
          {adiletCase.appeals.length === 0 && <p className="text-xs text-neutral-500">Апелляций нет.</p>}
        </div>

        {openAppeal && latestDecision && (
          <form action={resolveAppealAction.bind(null, adiletCase.id, openAppeal.id)} className="mt-3 grid grid-cols-1 gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm sm:grid-cols-2">
            <p className="text-xs text-neutral-500 sm:col-span-2">Рассмотрение апелляции доступно только роли director/admin — сервер перепроверяет роль.</p>
            <select name="resolution" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1">
              <option value="">Итог рассмотрения…</option>
              <option value="UPHELD">UPHELD — решение оставлено в силе</option>
              <option value="MODIFIED">MODIFIED — санкция изменена</option>
              <option value="OVERTURNED">OVERTURNED — решение отменено</option>
            </select>
            <select name="modifiedSanctionType" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1">
              <option value="">Новая санкция (если MODIFIED)…</option>
              <option value="DEESCALATION">DEESCALATION</option>
              <option value="EXPLANATION">EXPLANATION</option>
              <option value="FORMAL_WARNING">FORMAL_WARNING</option>
              <option value="TEMPORARY_RESTRICTION">TEMPORARY_RESTRICTION</option>
              <option value="TEMPORARY_SUSPENSION">TEMPORARY_SUSPENSION</option>
              <option value="ADVISORY">ADVISORY</option>
              <option value="RELIABILITY_PENALTY">RELIABILITY_PENALTY</option>
              <option value="LIMITED_ACCESS">LIMITED_ACCESS</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
            <textarea name="reviewNotes" placeholder="Заключение директора" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 sm:col-span-2" />
            <button type="submit" className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white sm:w-fit">
              Вынести решение по апелляции
            </button>
          </form>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">История</h3>
        <div className="space-y-1">
          {timeline.map((e) => (
            <div key={e.id} className="text-xs text-neutral-500">
              {e.createdAt.toLocaleString("ru-RU")} · {e.action}
            </div>
          ))}
          {timeline.length === 0 && <p className="text-xs text-neutral-500">Записей нет.</p>}
        </div>
      </section>
    </div>
  );
}
