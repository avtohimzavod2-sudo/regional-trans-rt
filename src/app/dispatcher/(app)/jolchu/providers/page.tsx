import { db } from "@/lib/db";
import { getJolchuModelProviderStatus } from "@/lib/jolchu/providers/model-provider";
import { getRouteProviderStatus } from "@/lib/jolchu/route-providers/route-provider";

export const dynamic = "force-dynamic";

function StatusBadge({ ready }: { ready: boolean }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${ready ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
      {ready ? "готов" : "не готов"}
    </span>
  );
}

export default async function JolchuProvidersPage() {
  const modelStatus = getJolchuModelProviderStatus();
  const routeStatus = getRouteProviderStatus();
  const executionsByProvider = await db.jolchuProviderExecution.groupBy({
    by: ["provider", "purpose", "ok"],
    _count: true,
    orderBy: { provider: "asc" },
  });

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">JolchuModelProvider (понимание языка)</h3>
            <StatusBadge ready={modelStatus.ready} />
          </div>
          <div className="text-sm text-neutral-400">
            <div>Настроен: {modelStatus.configuredProvider}</div>
            <div>Модель: {modelStatus.modelId}</div>
            {!modelStatus.ready && <div className="text-amber-400">{modelStatus.reason}</div>}
          </div>
          <p className="mt-3 text-xs text-neutral-600">
            LLM здесь используется только для очистки текста и определения ориентиров/неоднозначности — никогда для
            координат, км, времени в пути или трафика.
          </p>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">RouteProvider (реальная география)</h3>
            <StatusBadge ready={routeStatus.ready} />
          </div>
          <div className="text-sm text-neutral-400">
            <div>Основной: {routeStatus.configuredProvider}</div>
            <div>Резервный: {routeStatus.fallbackProvider ?? "нет"}</div>
            {!routeStatus.ready && <div className="text-amber-400">{routeStatus.reason}</div>}
          </div>
          <p className="mt-3 text-xs text-neutral-600">
            Единственный источник истины по географии: geocode()/calculateRoute(). &quot;Карты — это не LLM&quot;.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Статистика вызовов провайдеров</h2>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-3 py-2">Провайдер</th>
                <th className="px-3 py-2">Назначение</th>
                <th className="px-3 py-2">Успешно</th>
                <th className="px-3 py-2">Вызовов</th>
              </tr>
            </thead>
            <tbody>
              {executionsByProvider.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={4}>
                    Вызовов провайдеров ещё не было.
                  </td>
                </tr>
              )}
              {executionsByProvider.map((g, i) => (
                <tr key={i} className="border-t border-neutral-800">
                  <td className="px-3 py-2">{g.provider}</td>
                  <td className="px-3 py-2 text-neutral-500">{g.purpose}</td>
                  <td className={`px-3 py-2 ${g.ok ? "text-emerald-400" : "text-red-400"}`}>{g.ok ? "да" : "нет"}</td>
                  <td className="px-3 py-2">{g._count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
