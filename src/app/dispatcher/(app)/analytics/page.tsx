import { db } from "@/lib/db";
import {
  getCompletedPassengersCount,
  getFillRate,
  getConversionRate,
  getCancellationStats,
  getRtCommissionTotal,
  getBackhaulUtilization,
  getMostScarceDirections,
  getMostValuableDrivers,
} from "@/lib/agents/analytics";

export const dynamic = "force-dynamic";

function pct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const [passengers, fillRate, conversion, cancellations, commission, backhaul, scarce, valuableDrivers, stops] = await Promise.all([
    getCompletedPassengersCount(),
    getFillRate(),
    getConversionRate(),
    getCancellationStats(),
    getRtCommissionTotal(),
    getBackhaulUtilization(),
    getMostScarceDirections(),
    getMostValuableDrivers(),
    db.stop.findMany(),
  ]);

  const stopName = (id: string) => stops.find((s) => s.id === id)?.nameRu ?? id;

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-base font-semibold">Сводка (за всё время)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Перевезено пассажиров" value={String(passengers.completedPassengers)} />
          <StatCard label="Завершённых поездок" value={String(passengers.completedTrips)} />
          <StatCard label="Заполняемость мест" value={pct(fillRate.fillRate)} />
          <StatCard label="Конверсия заявок" value={pct(conversion.conversionRate)} />
          <StatCard label="Отмены" value={pct(cancellations.cancellationRate)} />
          <StatCard label="Комиссия RT" value={`${commission} сом`} />
          <StatCard label="Использование обратных рейсов" value={pct(backhaul.utilizationRate)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Самые дефицитные направления</h2>
        <div className="space-y-2">
          {scarce.map((s, i) => (
            <div key={i} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              {stopName(s.originStopId)} → {stopName(s.destinationStopId)} · запрошено мест: {s.passengersRequested} · доступно:{" "}
              {s.seatsAvailable} · дефицит: {s.shortage}
            </div>
          ))}
          {scarce.length === 0 && <p className="text-sm text-neutral-500">Нет данных.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Самые ценные водители</h2>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-3 py-2">Водитель</th>
                <th className="px-3 py-2">Категория</th>
                <th className="px-3 py-2">Поездок</th>
                <th className="px-3 py-2">Пассажиров</th>
                <th className="px-3 py-2">Комиссия</th>
              </tr>
            </thead>
            <tbody>
              {valuableDrivers.map((d) => (
                <tr key={d.driverId} className="border-t border-neutral-800">
                  <td className="px-3 py-2">{d.name ?? d.driverId}</td>
                  <td className="px-3 py-2">{d.category}</td>
                  <td className="px-3 py-2">{d.completedTrips}</td>
                  <td className="px-3 py-2">{d.passengersCarried}</td>
                  <td className="px-3 py-2">{d.commissionGeneratedSom} сом</td>
                </tr>
              ))}
              {valuableDrivers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-neutral-500">
                    Нет данных.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
