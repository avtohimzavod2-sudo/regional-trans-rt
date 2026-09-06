import { db } from "@/lib/db";
import { BENCHMARK_CASES } from "@/lib/mira/training/benchmark-cases";
import { runMiraBenchmarkAction } from "@/app/dispatcher/mira-actions";

export const dynamic = "force-dynamic";

function formatPct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export default async function MiraBenchmarkPage() {
  const runs = await db.miraBenchmarkRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 });

  return (
    <div className="space-y-6">
      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">RT Kyrgyz Benchmark</h2>
            <p className="text-sm text-neutral-500">
              {BENCHMARK_CASES.length} кейсов (включая adversarial: инъекции, попытки заставить выдумывать факты).
              Прогон использует текущий сконфигурированный MiraModelProvider.
            </p>
          </div>
          <form action={runMiraBenchmarkAction}>
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
                <th className="px-3 py-2">Провайдер</th>
                <th className="px-3 py-2">Пройдено</th>
                <th className="px-3 py-2">Роль</th>
                <th className="px-3 py-2">Маршрут</th>
                <th className="px-3 py-2">Дата/время</th>
                <th className="px-3 py-2">Места</th>
                <th className="px-3 py-2">Телефон</th>
                <th className="px-3 py-2">Галлюцинации</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={9}>
                    Прогонов ещё не было.
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 text-neutral-400">{r.startedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2">
                    {r.provider} / {r.model}
                  </td>
                  <td className="px-3 py-2">
                    {r.passedCases}/{r.totalCases}
                  </td>
                  <td className="px-3 py-2">{formatPct(r.roleAccuracy)}</td>
                  <td className="px-3 py-2">{formatPct(r.routeAccuracy)}</td>
                  <td className="px-3 py-2">{formatPct(r.dateTimeAccuracy)}</td>
                  <td className="px-3 py-2">{formatPct(r.seatAccuracy)}</td>
                  <td className="px-3 py-2">{formatPct(r.phoneAccuracy)}</td>
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
