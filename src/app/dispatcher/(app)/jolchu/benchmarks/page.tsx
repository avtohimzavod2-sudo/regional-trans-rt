import { db } from "@/lib/db";
import { BENCHMARK_CASES } from "@/lib/jolchu/training/benchmark-cases";
import { runJolchuBenchmarkAction } from "@/app/dispatcher/jolchu-actions";

export const dynamic = "force-dynamic";

function formatPct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export default async function JolchuBenchmarksPage() {
  const runs = await db.jolchuBenchmarkRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 });

  return (
    <div className="space-y-6">
      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Jolchu Benchmark</h2>
            <p className="text-sm text-neutral-500">
              {BENCHMARK_CASES.length} обязательных сценариев: routing-решения, разбор входных форматов, неоднозначность,
              расчёт маршрута, Last Mile, отказ провайдеров и fallback. Прогон использует текущие сконфигурированные
              JolchuModelProvider/RouteProvider.
            </p>
          </div>
          <form action={runJolchuBenchmarkAction}>
            <button
              type="submit"
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Запустить бенчмарк
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">История прогонов ({runs.length})</h2>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-3 py-2">Время</th>
                <th className="px-3 py-2">Провайдеры</th>
                <th className="px-3 py-2">Пройдено</th>
                <th className="px-3 py-2">Routing</th>
                <th className="px-3 py-2">Локации</th>
                <th className="px-3 py-2">Маршрут</th>
                <th className="px-3 py-2">Fallback</th>
                <th className="px-3 py-2">Галлюцинации</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={8}>
                    Прогонов ещё не было.
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 text-neutral-400">{r.startedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 text-neutral-500">
                    {r.modelProvider} / {r.routeProvider}
                  </td>
                  <td className="px-3 py-2">
                    {r.passedCases}/{r.totalCases}
                  </td>
                  <td className="px-3 py-2">{formatPct(r.routingDecisionAccuracy)}</td>
                  <td className="px-3 py-2">{formatPct(r.locationResolutionAccuracy)}</td>
                  <td className="px-3 py-2">{formatPct(r.routeCalculationAccuracy)}</td>
                  <td className="px-3 py-2">{formatPct(r.fallbackHandledCorrectly)}</td>
                  <td className={`px-3 py-2 ${r.hallucinationCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {r.hallucinationCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
