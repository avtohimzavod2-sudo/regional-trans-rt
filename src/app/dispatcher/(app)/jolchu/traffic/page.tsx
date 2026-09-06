import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const TRAFFIC_COLOR: Record<string, string> = {
  UNKNOWN: "text-neutral-500",
  FREE: "text-emerald-400",
  LIGHT: "text-emerald-300",
  MODERATE: "text-amber-400",
  HEAVY: "text-orange-400",
  SEVERE: "text-red-400",
};

export default async function JolchuTrafficPage() {
  const [byStatus, recent] = await Promise.all([
    db.jolchuRouteCalculation.groupBy({ by: ["trafficStatus"], _count: true }),
    db.jolchuRouteCalculation.findMany({
      where: { trafficStatus: { not: "UNKNOWN" } },
      orderBy: { calculatedAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Трафик</h2>
        <p className="text-sm text-neutral-500">
          trafficStatus всегда приходит от RouteProvider (реальные данные о текущей загруженности) либо остаётся
          UNKNOWN — Жолчу никогда не назначает наценку и никогда не выдумывает &quot;текущую&quot; загруженность в mock-режиме.
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Распределение по статусу</h3>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {byStatus.length === 0 && <p className="text-sm text-neutral-500">Данных ещё нет.</p>}
          {byStatus.map((g) => (
            <div key={g.trafficStatus} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className={TRAFFIC_COLOR[g.trafficStatus] ?? ""}>{g.trafficStatus}</div>
              <div className="text-xl font-semibold">{g._count}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Маршруты с известным трафиком ({recent.length})</h3>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-3 py-2">Время</th>
                <th className="px-3 py-2">Провайдер</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">ETA без трафика</th>
                <th className="px-3 py-2">ETA с трафиком</th>
                <th className="px-3 py-2">Задержка, мин</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={6}>
                    В mock-режиме трафик всегда UNKNOWN — подключите GOOGLE_MAPS_API_KEY, чтобы увидеть реальные данные.
                  </td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 text-neutral-400">{r.calculatedAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.provider}</td>
                  <td className={`px-3 py-2 ${TRAFFIC_COLOR[r.trafficStatus] ?? ""}`}>{r.trafficStatus}</td>
                  <td className="px-3 py-2">{r.estimatedDurationMin?.toFixed(0) ?? "—"}</td>
                  <td className="px-3 py-2">{r.trafficAwareDurationMin?.toFixed(0) ?? "—"}</td>
                  <td className="px-3 py-2">{r.trafficDelayMinutes?.toFixed(0) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
