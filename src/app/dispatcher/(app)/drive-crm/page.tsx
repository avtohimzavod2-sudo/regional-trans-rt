import Link from "next/link";
import { recentOperationalEvents } from "@/lib/crm-auto/bridge";
import { buildLiveFleetPicture } from "@/lib/rt-office/fleet-picture";
import type { OperationalState } from "@/lib/rt-office/types";
import { OPERATIONAL_STATE_BADGE, OPERATIONAL_STATE_LABEL_RU, OPERATIONAL_STATE_ORDER } from "@/lib/rt-office/state-labels";

export const dynamic = "force-dynamic";

const EVENT_TYPE_LABEL_RU: Record<string, string> = {
  OPERATIONAL_ETA: "ETA",
  BREAKDOWN_INCIDENT: "Поломка",
  BACKHAUL_OPPORTUNITY: "Обратный рейс",
  OPERATIONAL_HISTORY: "История",
  CORRECTION: "Исправление",
};

const EVENT_TYPE_BADGE: Record<string, string> = {
  OPERATIONAL_ETA: "bg-blue-950 text-blue-300",
  BREAKDOWN_INCIDENT: "bg-red-950 text-red-300",
  BACKHAUL_OPPORTUNITY: "bg-neutral-800 text-neutral-300",
  OPERATIONAL_HISTORY: "bg-neutral-800 text-neutral-400",
  CORRECTION: "bg-amber-950 text-amber-300",
};

// Drive CRM dispatcher screen — read-only view onto CRM Auto's append-only
// DriveCrmEvent log (spec PART 1/3). This page never writes anything; it
// reads exclusively through crm-auto/bridge.ts's recentOperationalEvents(),
// the same "CRM Auto is the single read/write access point onto its own
// model" rule RT OFFICE and Artur follow. Rows are never updated or deleted
// (see crm-auto/boundary.test.ts) — a CORRECTION event is shown inline,
// referencing the id of the event it corrects, never replacing it in this
// list.
export default async function DriveCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const activeFilter = OPERATIONAL_STATE_ORDER.includes(state as OperationalState) ? (state as OperationalState) : null;

  const [events, fleet] = await Promise.all([recentOperationalEvents(75), buildLiveFleetPicture()]);
  const visibleVehicles = activeFilter ? fleet.drivers.filter((d) => d.operationalState === activeFilter) : fleet.drivers;

  return (
    <div>
      <section className="mb-6 rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Сейчас — по автопарку ({fleet.totalDrivers} водителей)</h2>
          <span className="text-xs text-neutral-500">на {new Date(fleet.generatedAt).toLocaleString("ru-RU")}</span>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <Link
            href="/dispatcher/drive-crm"
            className={`rounded px-2 py-1 text-xs ${
              activeFilter === null ? "bg-neutral-200 text-neutral-900" : "bg-neutral-800 text-neutral-300"
            }`}
          >
            Все: {fleet.totalDrivers}
          </Link>
          {OPERATIONAL_STATE_ORDER.map((s) => (
            <Link
              key={s}
              href={`/dispatcher/drive-crm?state=${s}`}
              className={`rounded px-2 py-1 text-xs ${
                activeFilter === s ? "bg-neutral-200 text-neutral-900" : OPERATIONAL_STATE_BADGE[s]
              }`}
            >
              {OPERATIONAL_STATE_LABEL_RU[s]}: {fleet.counts[s]}
            </Link>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="pr-3 py-1">Водитель</th>
                <th className="pr-3 py-1">Статус</th>
                <th className="pr-3 py-1">Маршрут</th>
                <th className="pr-3 py-1">Места (своб/занят/всего)</th>
                <th className="pr-3 py-1">ETA</th>
                <th className="pr-3 py-1">Обратный рейс</th>
              </tr>
            </thead>
            <tbody>
              {visibleVehicles.map((d) => (
                <tr key={d.driverId} className="border-t border-neutral-800 align-top">
                  <td className="pr-3 py-1.5 text-neutral-300">
                    {d.driverName}
                    {d.vehicle.carPlate && <div className="text-neutral-600">{d.vehicle.carPlate}</div>}
                  </td>
                  <td className="pr-3 py-1.5">
                    <span className={`rounded px-2 py-0.5 ${OPERATIONAL_STATE_BADGE[d.operationalState]}`}>
                      {OPERATIONAL_STATE_LABEL_RU[d.operationalState]}
                    </span>
                    {d.breakdownOpen && <span className="ml-1 text-red-400">поломка</span>}
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-400">
                    {d.origin && d.destination ? (
                      <>
                        {d.origin.nameRu} → {d.destination.nameRu}
                        {d.departureWindow && (
                          <div className="text-neutral-600">
                            {d.departureWindow.travelDate}
                            {d.departureWindow.start && <> {d.departureWindow.start}–{d.departureWindow.end ?? "?"}</>}
                          </div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-400">
                    {d.seatsAvailable}/{d.seatsOccupied}/{d.seatsTotal}
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-400">
                    {d.etaMinutes !== null ? (
                      <>
                        {d.etaMinutes} мин · {d.etaFreshness?.source}
                        {d.etaFreshness?.stale && <span className="ml-1 text-amber-400">(устарело)</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-400">{d.isReturnLeg ? "да" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleVehicles.length === 0 && <p className="mt-2 text-neutral-500">Нет водителей с этим статусом.</p>}
        </div>
      </section>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Drive CRM — журнал операционных фактов ({events.length})</h2>
      </div>
      <p className="mb-4 text-xs text-neutral-500">
        Только чтение, только добавление записей (append-only) — ни одна запись здесь никогда не изменяется и не удаляется.
        Ошибочный факт исправляется только новой записью типа «Исправление», ссылающейся на исходную запись.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-neutral-500">
            <tr>
              <th className="pr-3 py-1">Тип</th>
              <th className="pr-3 py-1">Водитель</th>
              <th className="pr-3 py-1">Детали</th>
              <th className="pr-3 py-1">Источник</th>
              <th className="pr-3 py-1">Когда</th>
              <th className="pr-3 py-1">id</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800 align-top">
                <td className="pr-3 py-1.5">
                  <span className={`rounded px-2 py-0.5 ${EVENT_TYPE_BADGE[e.eventType] ?? "bg-neutral-800 text-neutral-400"}`}>
                    {EVENT_TYPE_LABEL_RU[e.eventType] ?? e.eventType}
                  </span>
                </td>
                <td className="pr-3 py-1.5 text-neutral-300">
                  {e.driver.name ?? e.driver.telegramUsername ?? e.driverId}
                  {e.driver.carPlate && <div className="text-neutral-600">{e.driver.carPlate}</div>}
                </td>
                <td className="pr-3 py-1.5 text-neutral-400">
                  {e.eventType === "OPERATIONAL_ETA" && e.etaMinutes !== null && <>ETA: {e.etaMinutes} мин</>}
                  {e.eventType === "BREAKDOWN_INCIDENT" && <>Статус: {e.incidentStatus}</>}
                  {e.eventType === "CORRECTION" && (
                    <>
                      исправляет: <span className="text-amber-300">{e.correctsEventId}</span>
                      {e.details && typeof e.details === "object" && "reason" in (e.details as Record<string, unknown>) && (
                        <div className="text-neutral-500">причина: {String((e.details as Record<string, unknown>).reason)}</div>
                      )}
                    </>
                  )}
                  {e.tripId && <div className="text-neutral-600">tripId: {e.tripId}</div>}
                  {e.offerId && <div className="text-neutral-600">offerId: {e.offerId}</div>}
                </td>
                <td className="pr-3 py-1.5 text-neutral-400">{e.source}</td>
                <td className="pr-3 py-1.5 text-neutral-400">{e.createdAt.toLocaleString("ru-RU")}</td>
                <td className="pr-3 py-1.5 text-neutral-600">{e.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && <p className="mt-2 text-sm text-neutral-500">Событий пока нет.</p>}
      </div>
    </div>
  );
}
