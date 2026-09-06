import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function JolchuRoutesPage() {
  const routes = await db.jolchuRouteCalculation.findMany({
    orderBy: { calculatedAt: "desc" },
    take: 100,
    include: { segments: true },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Рассчитанные маршруты ({routes.length})</h2>
        <p className="text-sm text-neutral-500">
          roadDistanceKm — реальное дорожное расстояние от RouteProvider (никогда не по прямой). straightLineDistanceKm
          хранится отдельно для сравнения и никогда не передаётся дальше как km поездки.
        </p>
      </div>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-900 text-neutral-500">
            <tr>
              <th className="px-3 py-2">Время</th>
              <th className="px-3 py-2">Провайдер</th>
              <th className="px-3 py-2">Дорога, км</th>
              <th className="px-3 py-2">По прямой, км</th>
              <th className="px-3 py-2">ETA, мин</th>
              <th className="px-3 py-2">Трафик</th>
              <th className="px-3 py-2">Last Mile</th>
              <th className="px-3 py-2">Флаги</th>
              <th className="px-3 py-2">Сегментов</th>
            </tr>
          </thead>
          <tbody>
            {routes.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-neutral-500" colSpan={9}>
                  Маршрутов ещё не было.
                </td>
              </tr>
            )}
            {routes.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800 align-top">
                <td className="px-3 py-2 text-neutral-400">{r.calculatedAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td className="px-3 py-2 text-neutral-500">{r.provider}</td>
                <td className="px-3 py-2">{r.roadDistanceKm?.toFixed(1) ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-500">{r.straightLineDistanceKm?.toFixed(1) ?? "—"}</td>
                <td className="px-3 py-2">{r.estimatedDurationMin?.toFixed(0) ?? "—"}</td>
                <td className="px-3 py-2">{r.trafficStatus}</td>
                <td className={`px-3 py-2 ${r.lastMileDetected ? "text-amber-400" : "text-neutral-600"}`}>
                  {r.lastMileDetected ? `да (${r.lastMileDistanceKm?.toFixed(1)} км)` : "нет"}
                </td>
                <td className="px-3 py-2 text-neutral-500">
                  {[r.tollFlag && "платная", r.ferryFlag && "паром", r.unpavedRoadFlag && "грунт", r.roadClosureFlag && "закрыто"]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td className="px-3 py-2">{r.segments.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
