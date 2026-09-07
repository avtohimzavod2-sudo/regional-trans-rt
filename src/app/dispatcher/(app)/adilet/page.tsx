import Link from "next/link";
import { db } from "@/lib/db";
import { openCaseAction } from "../../adilet-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-neutral-800 text-neutral-400",
  UNDER_REVIEW: "bg-blue-950 text-blue-300",
  AWAITING_EVIDENCE: "bg-amber-950 text-amber-300",
  DECIDED: "bg-green-950 text-green-300",
  APPEAL_REQUESTED: "bg-purple-950 text-purple-300",
  UNDER_APPEAL_REVIEW: "bg-purple-950 text-purple-300",
  CLOSED: "bg-neutral-800 text-neutral-500",
};

const SEVERITY_BADGE: Record<string, string> = {
  LOW: "bg-neutral-800 text-neutral-400",
  NORMAL: "bg-neutral-800 text-neutral-400",
  HIGH: "bg-amber-950 text-amber-300",
  CRITICAL: "bg-red-950 text-red-300",
};

function CaseRow({ c }: { c: { id: string; caseType: string; status: string; severity: string; summary: string; openedAt: Date } }) {
  return (
    <div key={c.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
      <div className="flex items-center justify-between">
        <Link href={`/dispatcher/adilet/${c.id}`} className="font-medium hover:underline">
          {c.caseType} · {c.id.slice(0, 8)}
        </Link>
        <div className="flex gap-2">
          <span className={`rounded px-2 py-0.5 text-xs ${SEVERITY_BADGE[c.severity] ?? "bg-neutral-800 text-neutral-400"}`}>{c.severity}</span>
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[c.status] ?? "bg-neutral-800 text-neutral-400"}`}>{c.status}</span>
        </div>
      </div>
      <div className="mt-1 text-neutral-300">{c.summary}</div>
      <div className="mt-1 text-xs text-neutral-500">открыто {c.openedAt.toLocaleString("ru-RU")}</div>
    </div>
  );
}

export default async function AdiletDashboardPage() {
  const [openCases, criticalCases, awaitingEvidence, pendingAppeal, activeSuspensions, activeBlocks] = await Promise.all([
    db.adiletCase.findMany({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } }, orderBy: { openedAt: "desc" }, take: 50 }),
    db.adiletCase.findMany({ where: { severity: "CRITICAL", status: { not: "CLOSED" } }, orderBy: { openedAt: "desc" }, take: 50 }),
    db.adiletCase.findMany({ where: { status: "AWAITING_EVIDENCE" }, orderBy: { openedAt: "desc" }, take: 50 }),
    db.adiletCase.findMany({ where: { status: { in: ["APPEAL_REQUESTED", "UNDER_APPEAL_REVIEW"] } }, orderBy: { openedAt: "desc" }, take: 50 }),
    db.adiletSanction.findMany({ where: { status: "ACTIVE", sanctionType: { in: ["TEMPORARY_SUSPENSION", "SUSPENDED"] } }, orderBy: { startAt: "desc" }, take: 50 }),
    db.adiletSanction.findMany({ where: { status: "ACTIVE", sanctionType: "BLOCKED" }, orderBy: { startAt: "desc" }, take: 50 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Адилет — разбор споров и дисциплина</h2>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Открыть дело вручную</h3>
        <form action={openCaseAction} className="grid grid-cols-1 gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm sm:grid-cols-2">
          <select name="caseType" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1">
            <option value="">Тип дела…</option>
            <option value="CUSTOMER_COMPLAINT">CUSTOMER_COMPLAINT</option>
            <option value="CUSTOMER_ABUSE">CUSTOMER_ABUSE</option>
            <option value="EXECUTOR_MISCONDUCT">EXECUTOR_MISCONDUCT</option>
            <option value="SERVICE_FAILURE">SERVICE_FAILURE</option>
            <option value="PAYMENT_DISPUTE">PAYMENT_DISPUTE</option>
            <option value="SAFETY_COMPLAINT">SAFETY_COMPLAINT</option>
            <option value="DAMAGE_OR_LOSS">DAMAGE_OR_LOSS</option>
            <option value="NO_SHOW">NO_SHOW</option>
            <option value="PRICE_DISPUTE">PRICE_DISPUTE</option>
            <option value="CANCELLATION_DISPUTE">CANCELLATION_DISPUTE</option>
            <option value="AGENT_ESCALATION">AGENT_ESCALATION</option>
            <option value="OTHER">OTHER</option>
          </select>
          <input name="summary" placeholder="Краткое описание" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="allegation" placeholder="Суть претензии" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 sm:col-span-2" />
          <input name="relatedUserId" placeholder="ID клиента/водителя (если есть)" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="relatedExecutorId" placeholder="ID исполнителя (если есть)" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="shipmentId" placeholder="ID заявки (если есть)" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 sm:col-span-2" />
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
          <button type="submit" className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white sm:col-span-2 sm:w-fit">
            Открыть дело
          </button>
        </form>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Критичные ({criticalCases.length})</h3>
        <div className="space-y-2">
          {criticalCases.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
          {criticalCases.length === 0 && <p className="text-sm text-neutral-500">Нет критичных дел.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Открытые дела ({openCases.length})</h3>
        <div className="space-y-2">
          {openCases.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
          {openCases.length === 0 && <p className="text-sm text-neutral-500">Нет открытых дел.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Ждут доказательств ({awaitingEvidence.length})</h3>
        <div className="space-y-2">
          {awaitingEvidence.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
          {awaitingEvidence.length === 0 && <p className="text-sm text-neutral-500">Нет дел, ожидающих доказательств.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">На апелляции ({pendingAppeal.length})</h3>
        <div className="space-y-2">
          {pendingAppeal.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
          {pendingAppeal.length === 0 && <p className="text-sm text-neutral-500">Нет дел на апелляции.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Активные приостановки ({activeSuspensions.length})</h3>
        <div className="space-y-1">
          {activeSuspensions.map((s) => (
            <div key={s.id} className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300">
              <Link href={`/dispatcher/adilet/${s.caseId}`} className="hover:underline">
                {s.subjectType} {s.subjectId}
              </Link>{" "}
              · {s.sanctionType} · до {s.expiresAt ? s.expiresAt.toLocaleString("ru-RU") : "бессрочно"}
            </div>
          ))}
          {activeSuspensions.length === 0 && <p className="text-xs text-neutral-500">Нет активных приостановок.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Активные блокировки ({activeBlocks.length})</h3>
        <div className="space-y-1">
          {activeBlocks.map((s) => (
            <div key={s.id} className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300">
              <Link href={`/dispatcher/adilet/${s.caseId}`} className="hover:underline">
                {s.subjectType} {s.subjectId}
              </Link>{" "}
              · {s.reason}
            </div>
          ))}
          {activeBlocks.length === 0 && <p className="text-xs text-neutral-500">Нет активных блокировок.</p>}
        </div>
      </section>
    </div>
  );
}
