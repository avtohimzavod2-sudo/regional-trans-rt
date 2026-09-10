import Link from "next/link";
import { recentOperationalEvents } from "@/lib/crm-auto/bridge";
import { buildLiveFleetPicture } from "@/lib/rt-office/fleet-picture";
import { deriveFleetAttentionFeed } from "@/lib/rt-office/attention";
import type { OperationalState } from "@/lib/rt-office/types";
import {
  ATTENTION_SEVERITY_BADGE,
  ATTENTION_SEVERITY_LABEL_RU,
  EVENT_TYPE_BADGE,
  EVENT_TYPE_LABEL_RU,
  OPERATIONAL_STATE_BADGE,
  OPERATIONAL_STATE_LABEL_RU,
  OPERATIONAL_STATE_ORDER,
} from "@/lib/rt-office/state-labels";

export const dynamic = "force-dynamic";

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
  // Derived from the fleet we already fetched above — no second DB read.
  const attention = deriveFleetAttentionFeed(fleet);

  return (
    <div>
      <section className="mb-6 rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Требует внимания ({attention.items.length})
          </h2>
          <div className="flex gap-2 text-xs">
            <span className={`rounded px-2 py-0.5 ${ATTENTION_SEVERITY_BADGE.CRITICAL}`}>
              {ATTENTION_SEVERITY_LABEL_RU.CRITICAL}: {attention.counts.CRITICAL}
            </span>
            <span className={`rounded px-2 py-0.5 ${ATTENTION_SEVERITY_BADGE.HIGH}`}>
              {ATTENTION_SEVERITY_LABEL_RU.HIGH}: {attention.counts.HIGH}
            </span>
            <span className={`rounded px-2 py-0.5 ${ATTENTION_SEVERITY_BADGE.WARNING}`}>
              {ATTENTION_SEVERITY_LABEL_RU.WARNING}: {attention.counts.WARNING}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          {attention.items.slice(0, 10).map((item, i) => (
            <Link
              key={`${item.driverId}-${item.type}-${i}`}
              href={`/dispatcher/drive-crm/${item.driverId}`}
              className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-950 p-2 text-xs hover:border-neutral-700"
            >
              <span className="text-neutral-300">
                {item.driverName}
                {item.vehicle.carPlate && <span className="text-neutral-600"> · {item.vehicle.carPlate}</span>}
                <span className="ml-2 text-neutral-500">{item.message}</span>
              </span>
              <span className={`rounded px-2 py-0.5 ${ATTENTION_SEVERITY_BADGE[item.severity]}`}>
                {ATTENTION_SEVERITY_LABEL_RU[item.severity]}
              </span>
            </Link>
          ))}
          {attention.items.length === 0 && <p className="text-xs text-neutral-500">Сейчас ничего не требует внимания.</p>}
        </div>
      </section>

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
                    <Link href={`/dispatcher/drive-crm/${d.driverId}`} className="hover:underline">
                      {d.driverName}
                    </Link>
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
                  <Link href={`/dispatcher/drive-crm/${e.driverId}`} className="hover:underline">
                    {e.driver.name ?? e.driver.telegramUsername ?? e.driverId}
                  </Link>
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
