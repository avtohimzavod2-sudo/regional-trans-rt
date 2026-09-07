import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { isFounderRole } from "@/lib/artur/role";
import { getLatestFounderBrief } from "@/lib/artur/daily-brief";
import { getLatestWeeklyDirectorReport } from "@/lib/artur/weekly-report";
import { listOpenEmergencyIncidents } from "@/lib/artur/emergency";
import { listScheduledJobRuns } from "@/lib/artur/scheduler";
import type { DailyFounderBrief, KpiRow, ProblemOfTheWeek } from "@/lib/artur/types";
import {
  generateDailyBriefNowAction,
  generateWeeklyReportNowAction,
  decideInitiativeAction,
  reportEmergencyAction,
  acknowledgeEmergencyAction,
  resolveEmergencyAction,
} from "../../artur-actions";

export const dynamic = "force-dynamic";

const INITIATIVE_STATUS_LABEL_RU: Record<string, string> = {
  PROPOSED: "Предложено",
  APPROVED: "Одобрено",
  REJECTED: "Отклонено",
  DEFERRED: "Отложено",
  NEEDS_REVISION: "Нужна доработка",
  IN_PROGRESS: "В работе",
  COMPLETED: "Завершено",
  MEASURED: "Эффект измерен",
};

const RT_STATUS_LABEL_RU: Record<string, string> = {
  NORMAL: "Норма",
  ATTENTION: "Внимание",
  CRITICAL: "Критично",
};

// Director "Artur" dashboard (AGENTS Master Architecture spec s.5-s.16).
// Full report content is Founder-only (spec s.38: never expose financial
// detail to unauthorized roles) — every dispatcher can still use the
// emergency-report form, since a genuine force-majeure escalation must not
// depend on the Founder account being the one logged in (spec s.17/s.18).
export default async function ArturDashboardPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  const isFounder = !!session && isFounderRole(session.role);

  const [brief, weeklyReport, openEmergencies, jobRuns] = isFounder
    ? await Promise.all([
        getLatestFounderBrief(session.role),
        getLatestWeeklyDirectorReport(session.role),
        listOpenEmergencyIncidents(session.role),
        listScheduledJobRuns(20),
      ])
    : [null, null, [], []];

  const briefSections = brief ? (brief.sections as unknown as DailyFounderBrief) : null;
  const kpis = weeklyReport ? (weeklyReport.kpis as unknown as KpiRow[]) : [];
  const problems = weeklyReport ? (weeklyReport.problems as unknown as ProblemOfTheWeek[]) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Артур — директор ИИ RT</h2>
        {briefSections && (
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            Статус: {RT_STATUS_LABEL_RU[briefSections.overallStatus] ?? briefSections.overallStatus}
          </span>
        )}
      </div>

      {!isFounder && (
        <p className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          Полная панель Артура доступна только роли founder/admin. Ниже — форма экстренного сообщения, доступная любому диспетчеру.
        </p>
      )}

      {isFounder && (
        <section className="flex flex-wrap gap-2">
          <form action={generateDailyBriefNowAction}>
            <button type="submit" className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700">
              Сформировать брифинг сейчас
            </button>
          </form>
          <form action={generateWeeklyReportNowAction}>
            <button type="submit" className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700">
              Сформировать недельный отчёт сейчас
            </button>
          </form>
        </section>
      )}

      {isFounder && briefSections && (
        <section className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
          <h3 className="mb-2 text-sm font-semibold text-neutral-300">Ежедневный брифинг основателю — {briefSections.reportDate}</h3>
          <div className="space-y-2">
            <div>
              <div className="text-xs font-medium text-neutral-400">Ключевые события</div>
              {briefSections.keyEvents.length > 0 ? briefSections.keyEvents.map((e, i) => <p key={i} className="text-neutral-300">{e}</p>) : <p className="text-neutral-500">Норма.</p>}
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-400">Пассажирские перевозки</div>
              <p className="text-neutral-300">{briefSections.passenger.summary}</p>
              <p className="text-xs text-neutral-500">
                Спрос: {briefSections.passenger.demand} · Завершено: {briefSections.passenger.completed} · Отмены: {briefSections.passenger.cancellations}
              </p>
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-400">Грузоперевозки</div>
              <p className="text-neutral-300">{briefSections.cargo.summary}</p>
              <p className="text-xs text-neutral-500">
                Принято: {briefSections.cargo.accepted} · Завершено: {briefSections.cargo.completed} · Задержано: {briefSections.cargo.delayed}
              </p>
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-400">Финансы</div>
              <p className="text-neutral-300">{briefSections.finance.summary}</p>
              <p className="text-xs text-neutral-500">
                Поступило: {briefSections.finance.incomingSom} сом · Сверено: {briefSections.finance.verifiedSom} сом · Расхождений: {briefSections.finance.discrepancies}
              </p>
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-400">Жалобы</div>
              <p className="text-neutral-300">{briefSections.complaints.summary}</p>
              <p className="text-xs text-neutral-500">
                Открыто: {briefSections.complaints.opened} · Закрыто: {briefSections.complaints.resolved} · Критично открытых: {briefSections.complaints.criticalOpen}
              </p>
            </div>
            {briefSections.stuckTasks.length > 0 && (
              <div>
                <div className="text-xs font-medium text-neutral-400">Зависшие задачи</div>
                {briefSections.stuckTasks.map((t, i) => (
                  <p key={i} className="text-xs text-amber-300">
                    {t.what} — {t.responsibleDomain} ({t.ageHours} ч.): {t.impact}
                  </p>
                ))}
              </div>
            )}
            {briefSections.risksToday.length > 0 && (
              <div>
                <div className="text-xs font-medium text-neutral-400">Риски на сегодня</div>
                {briefSections.risksToday.map((r, i) => <p key={i} className="text-xs text-amber-300">{r}</p>)}
              </div>
            )}
            {briefSections.founderDecisionsRequired.length > 0 && (
              <div>
                <div className="text-xs font-medium text-neutral-400">Требуются решения основателя</div>
                {briefSections.founderDecisionsRequired.map((d, i) => <p key={i} className="text-xs text-red-300">{d}</p>)}
              </div>
            )}
          </div>
        </section>
      )}

      {isFounder && weeklyReport && (
        <section className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
          <h3 className="mb-2 text-sm font-semibold text-neutral-300">
            Недельный отчёт директора — {weeklyReport.weekStartDate} … {weeklyReport.weekEndDate}
          </h3>
          <p className="mb-2 text-neutral-300">{weeklyReport.executiveSummary}</p>

          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-neutral-500">
                <tr>
                  <th className="pr-3 py-1">Показатель</th>
                  <th className="pr-3 py-1">Тек. неделя</th>
                  <th className="pr-3 py-1">Пред. неделя</th>
                  <th className="pr-3 py-1">Изменение</th>
                  <th className="pr-3 py-1">Статус</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((k, i) => (
                  <tr key={i} className="border-t border-neutral-800">
                    <td className="pr-3 py-1 text-neutral-300">{k.name}</td>
                    <td className="pr-3 py-1 text-neutral-400">{k.currentWeek}</td>
                    <td className="pr-3 py-1 text-neutral-400">{k.previousWeek}</td>
                    <td className="pr-3 py-1 text-neutral-400">{k.percentageChange === null ? "—" : `${k.percentageChange.toFixed(1)}%`}</td>
                    <td className="pr-3 py-1 text-neutral-400">{k.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {problems.length > 0 && (
            <div className="mb-3 space-y-1">
              <div className="text-xs font-medium text-neutral-400">Проблемы недели</div>
              {problems.map((p, i) => (
                <div key={i} className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs">
                  <div className="font-medium text-neutral-300">{p.problem}</div>
                  <div className="text-neutral-500">
                    {p.rootCause ? `Причина: ${p.rootCause}` : "Причина: гипотеза, не подтверждена"} · {p.responsibleDomain} · {p.severity}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-medium text-neutral-400">Инициативы недели (ровно 3)</div>
            {weeklyReport.initiatives.map((init) => (
              <div key={init.id} className="rounded border border-neutral-800 bg-neutral-950 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-200">{init.title}</span>
                  <span className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-400">{INITIATIVE_STATUS_LABEL_RU[init.status] ?? init.status}</span>
                </div>
                <p className="mt-1 text-neutral-400">{init.proposal}</p>
                <p className="mt-1 text-neutral-500">Почему сейчас: {init.whyNow}</p>
                <p className="text-neutral-500">Ожидаемый эффект: {init.expectedEffect}</p>
                {(init.status === "PROPOSED" || init.status === "NEEDS_REVISION" || init.status === "DEFERRED") && (
                  <form action={decideInitiativeAction.bind(null, init.id)} className="mt-2 flex flex-wrap items-center gap-2">
                    <select name="status" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1">
                      <option value="APPROVED">Одобрить</option>
                      <option value="REJECTED">Отклонить</option>
                      <option value="DEFERRED">Отложить</option>
                      <option value="NEEDS_REVISION">На доработку</option>
                    </select>
                    <input name="note" placeholder="Комментарий (необязательно)" className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
                    <button type="submit" className="rounded bg-neutral-100 px-2 py-1 font-medium text-neutral-900 hover:bg-white">
                      Отправить решение
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {isFounder && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-neutral-300">Открытые экстренные инциденты ({openEmergencies.length})</h3>
          <div className="space-y-2">
            {openEmergencies.map((e) => (
              <div key={e.id} className="rounded border border-red-900 bg-red-950/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-red-200">{e.severity}</span>
                  <span className="text-xs text-neutral-500">{e.resolutionStatus}</span>
                </div>
                <p className="mt-1 text-neutral-300">{e.whatHappened}</p>
                <p className="mt-1 text-xs text-neutral-500">Статус: {e.currentStatus}</p>
                {e.recommendation && <p className="text-xs text-neutral-500">Рекомендация: {e.recommendation}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {e.resolutionStatus === "OPEN" && (
                    <form action={acknowledgeEmergencyAction.bind(null, e.id)}>
                      <button type="submit" className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700">
                        Принять к сведению
                      </button>
                    </form>
                  )}
                  <form action={resolveEmergencyAction.bind(null, e.id)} className="flex flex-1 gap-2">
                    <input name="founderResponse" placeholder="Решение основателя" required className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs" />
                    <button type="submit" className="rounded bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-900 hover:bg-white">
                      Закрыть инцидент
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {openEmergencies.length === 0 && <p className="text-sm text-neutral-500">Нет открытых экстренных инцидентов.</p>}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Сообщить об экстренной ситуации (24/7)</h3>
        <form action={reportEmergencyAction} className="grid grid-cols-1 gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm sm:grid-cols-2">
          <textarea name="whatHappened" placeholder="Что произошло" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 sm:col-span-2" />
          <input name="currentStatus" placeholder="Текущий статус" required className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <select name="severity" defaultValue="HIGH" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" required>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
          <input name="peopleOrdersMoneyAffected" placeholder="Затронуты люди/заказы/деньги" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="actionsTaken" placeholder="Уже предпринятые действия" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="immediateRisks" placeholder="Непосредственные риски" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="availableOptions" placeholder="Доступные варианты" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="recommendation" placeholder="Рекомендация" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
          <input name="decisionRequired" placeholder="Какое решение требуется" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 sm:col-span-2" />
          <button type="submit" className="rounded bg-red-900 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-800 sm:col-span-2 sm:w-fit">
            Отправить основателю
          </button>
        </form>
      </section>

      {isFounder && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-neutral-300">Запуски планировщика (последние {jobRuns.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-neutral-500">
                <tr>
                  <th className="pr-3 py-1">Задача</th>
                  <th className="pr-3 py-1">Период</th>
                  <th className="pr-3 py-1">Статус</th>
                  <th className="pr-3 py-1">Запущено</th>
                </tr>
              </thead>
              <tbody>
                {jobRuns.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-800">
                    <td className="pr-3 py-1 text-neutral-300">{r.jobName}</td>
                    <td className="pr-3 py-1 text-neutral-400">{r.periodKey}</td>
                    <td className="pr-3 py-1 text-neutral-400">{r.status}</td>
                    <td className="pr-3 py-1 text-neutral-400">{r.startedAt.toISOString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {jobRuns.length === 0 && <p className="mt-2 text-sm text-neutral-500">Запусков ещё не было.</p>}
        </section>
      )}
    </div>
  );
}
