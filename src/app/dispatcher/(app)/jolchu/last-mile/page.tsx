import { db } from "@/lib/db";
import { getLastMileThresholdKm } from "@/lib/jolchu/config";
import { KNOWN_HUBS } from "@/lib/jolchu/gazetteer";

export const dynamic = "force-dynamic";

export default async function JolchuLastMilePage() {
  const [detectedRoutes, totalRoutes] = await Promise.all([
    db.jolchuRouteCalculation.findMany({
      where: { lastMileDetected: true },
      orderBy: { calculatedAt: "desc" },
      take: 50,
    }),
    db.jolchuRouteCalculation.count(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Last Mile</h2>
        <p className="text-sm text-neutral-500">
          Отделяет MAIN_INTERCITY_ROUTE от участка после ближайшего известного узла (хаба). Порог настраивается через{" "}
          <code>JOLCHU_LAST_MILE_THRESHOLD_KM</code> (сейчас {getLastMileThresholdKm()} км) — это не коммерческая
          логика, только геометрия.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-500">Маршрутов всего</div>
          <div className="mt-1 text-2xl font-semibold">{totalRoutes}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-500">С обнаруженным Last Mile</div>
          <div className="mt-1 text-2xl font-semibold">{detectedRoutes.length}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-500">Известных узлов (хабов)</div>
          <div className="mt-1 text-2xl font-semibold">{KNOWN_HUBS.length}</div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Маршруты с Last Mile</h3>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-3 py-2">Время</th>
                <th className="px-3 py-2">Осн. маршрут, км</th>
                <th className="px-3 py-2">Last Mile, км</th>
                <th className="px-3 py-2">Итого, км</th>
              </tr>
            </thead>
            <tbody>
              {detectedRoutes.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={4}>
                    Case с Last Mile ещё не было.
                  </td>
                </tr>
              )}
              {detectedRoutes.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 text-neutral-400">{r.calculatedAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td className="px-3 py-2">{r.mainRouteDistanceKm?.toFixed(1) ?? "—"}</td>
                  <td className="px-3 py-2 text-amber-400">{r.lastMileDistanceKm?.toFixed(1) ?? "—"}</td>
                  <td className="px-3 py-2">{r.totalDistanceKm?.toFixed(1) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
