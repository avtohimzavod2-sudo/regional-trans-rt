import { db } from "@/lib/db";
import { getJolchuModelProviderStatus } from "@/lib/jolchu/providers/model-provider";
import { getRouteProviderStatus } from "@/lib/jolchu/route-providers/route-provider";
import { getJolchuRefreshStatus } from "@/lib/jolchu/data-refresh";
import { BENCHMARK_CASES } from "@/lib/jolchu/training/benchmark-cases";

export const dynamic = "force-dynamic";

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

export default async function JolchuOverviewPage() {
  const [requestsByStatus, totalRequests, openAmbiguities, latestBenchmarkRun, providerCallCount, refreshStatus] =
    await Promise.all([
      db.jolchuRequest.groupBy({ by: ["status"], _count: true }),
      db.jolchuRequest.count(),
      db.jolchuLocationAmbiguity.count({ where: { status: "OPEN" } }),
      db.jolchuBenchmarkRun.findFirst({ orderBy: { startedAt: "desc" } }),
      db.jolchuProviderExecution.count(),
      getJolchuRefreshStatus(),
    ]);

  const modelStatus = getJolchuModelProviderStatus();
  const routeStatus = getRouteProviderStatus();
  const totalRequestsComputed = requestsByStatus.reduce((sum, g) => sum + g._count, 0);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Запросов" value={totalRequests} hint={`${totalRequestsComputed} по статусам`} />
        <StatCard
          label="Модель (LLM)"
          value={modelStatus.configuredProvider}
          hint={modelStatus.ready ? modelStatus.modelId : (modelStatus.reason ?? "не настроен")}
        />
        <StatCard
          label="Провайдер маршрутов"
          value={routeStatus.configuredProvider}
          hint={routeStatus.ready ? `fallback: ${routeStatus.fallbackProvider ?? "нет"}` : (routeStatus.reason ?? "не настроен")}
        />
        <StatCard label="Открытых неоднозначностей" value={openAmbiguities} hint="требуют уточнения у пользователя" />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Запросы по статусу</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {requestsByStatus.length === 0 && <p className="text-sm text-neutral-500">Запросов ещё не было.</p>}
          {requestsByStatus.map((g) => (
            <div key={g.status} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className="text-neutral-500">{g.status}</div>
              <div className="text-xl font-semibold">{g._count}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Последний прогон бенчмарка</h2>
        {latestBenchmarkRun ? (
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm">
            <div className="mb-2 text-neutral-400">
              {latestBenchmarkRun.modelProvider} / {latestBenchmarkRun.routeProvider} · {latestBenchmarkRun.passedCases}/
              {latestBenchmarkRun.totalCases} пройдено ·{" "}
              {latestBenchmarkRun.startedAt.toISOString().slice(0, 16).replace("T", " ")}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400 md:grid-cols-4">
              <div>Маршрутизация: {formatPct(latestBenchmarkRun.routingDecisionAccuracy)}</div>
              <div>Локации: {formatPct(latestBenchmarkRun.locationResolutionAccuracy)}</div>
              <div>Маршруты: {formatPct(latestBenchmarkRun.routeCalculationAccuracy)}</div>
              <div>Fallback: {formatPct(latestBenchmarkRun.fallbackHandledCorrectly)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Бенчмарк ещё не запускался. См. вкладку «Бенчмарк».</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Служебные данные</h2>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <StatCard label="Кейсов бенчмарка" value={BENCHMARK_CASES.length} />
          <StatCard label="Вызовов провайдеров" value={providerCallCount} />
          <StatCard
            label="Актуальность данных"
            value={refreshStatus.overdue ? "просрочено" : "актуально"}
            hint={refreshStatus.lastSuccessfulRun ? refreshStatus.lastSuccessfulRun.startedAt.toISOString().slice(0, 10) : "обновления ещё не было"}
          />
          <StatCard label="Интервал обновления" value={`${refreshStatus.intervalDays} дн.`} />
        </div>
      </section>
    </div>
  );
}

function formatPct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}
