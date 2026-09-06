import { db } from "@/lib/db";
import { getJolchuRefreshStatus } from "@/lib/jolchu/data-refresh";
import { runJolchuDataRefreshAction } from "@/app/dispatcher/jolchu-actions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  RUNNING: "text-amber-400",
  SUCCEEDED: "text-emerald-400",
  FAILED: "text-red-400",
};

function fmt(d: Date | null): string {
  return d ? d.toISOString().slice(0, 19).replace("T", " ") : "—";
}

export default async function JolchuDataFreshnessPage() {
  const [status, runs] = await Promise.all([
    getJolchuRefreshStatus(),
    db.jolchuDataRefreshRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Актуальность справочных данных</h2>
            <p className="text-sm text-neutral-500">
              Обязательное обновление справочных данных (известные узлы/ориентиры, снапшот доступности провайдеров) —
              не живой трафик, он всегда получается в реальном времени per-запрос. Никакого скрытого самообучения:
              каждое обновление — это одна наблюдаемая запись JolchuDataRefreshRun.
            </p>
          </div>
          <form action={runJolchuDataRefreshAction}>
            <button
              type="submit"
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 whitespace-nowrap"
            >
              Обновить сейчас
            </button>
          </form>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-500">Интервал, дней</div>
          <div className="mt-1 text-2xl font-semibold">{status.intervalDays}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-500">Последнее успешное</div>
          <div className="mt-1 text-sm font-medium">{fmt(status.lastSuccessfulRun?.startedAt ?? null)}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-500">Следующее плановое</div>
          <div className="mt-1 text-sm font-medium">{fmt(status.nextPlannedRefreshAt)}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-500">Статус</div>
          <div className={`mt-1 text-sm font-semibold ${status.overdue ? "text-red-400" : "text-emerald-400"}`}>
            {status.overdue ? "просрочено" : "актуально"}
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">История обновлений ({runs.length})</h3>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-3 py-2">Начало</th>
                <th className="px-3 py-2">Завершение</th>
                <th className="px-3 py-2">Версия</th>
                <th className="px-3 py-2">Кем запущено</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Ошибки</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={6}>
                    Обновлений ещё не было.
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 text-neutral-400">{fmt(r.startedAt)}</td>
                  <td className="px-3 py-2 text-neutral-400">{fmt(r.finishedAt)}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.refreshVersion}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.triggeredBy}</td>
                  <td className={`px-3 py-2 ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</td>
                  <td className="px-3 py-2 text-red-400">{r.errors.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
