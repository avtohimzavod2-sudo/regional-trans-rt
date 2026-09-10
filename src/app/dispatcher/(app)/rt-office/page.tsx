import { db } from "@/lib/db";
import { resolveDemandAgainstSupply } from "@/lib/rt-office/facts";
import { internalSupplyView } from "@/lib/rt-office/bridge";
import { buildLiveFleetPicture } from "@/lib/rt-office/fleet-picture";
import { OPERATIONAL_STATE_BADGE, OPERATIONAL_STATE_LABEL_RU, OPERATIONAL_STATE_ORDER } from "@/lib/rt-office/state-labels";

export const dynamic = "force-dynamic";

// RT OFFICE dispatcher screen — read-only view onto RT OFFICE's demand<->supply
// fact resolution (spec s.4/s.5). This page never mutates anything: it calls
// the exact same resolveDemandAgainstSupply() Mira's conversation flow calls,
// through internalSupplyView() for the full (non-passenger-redacted) detail
// dispatchers need — offerId/driverId/vehicle identity/fact freshness. There
// is no separate "dispatcher matching" logic here, per the Founder's MATCHING
// directive: one exclusion-aware resolution path, reused everywhere.
export default async function RtOfficePage() {
  const fleet = await buildLiveFleetPicture();
  const pendingRequests = await db.tripRequest.findMany({
    where: { status: { in: ["PENDING", "MATCHING"] } },
    include: { origin: true, destination: true, passenger: true },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const resolutions = await Promise.all(
    pendingRequests.map(async (r) => ({
      request: r,
      resolution: internalSupplyView(await resolveDemandAgainstSupply(r.id)),
    })),
  );

  return (
    <div>
      <section className="mb-6 rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Живая линия RT — сейчас по всей сети ({fleet.totalDrivers} водителей)</h2>
          <span className="text-xs text-neutral-500">на {new Date(fleet.generatedAt).toLocaleString("ru-RU")}</span>
        </div>
        <p className="mb-3 text-xs text-neutral-500">
          Сводка по каждому водителю строится один раз через buildLiveFleetPicture() — тем же деривациям статуса
          (deriveOperationalState) и тем же фактам (CRM Auto, DriverOffer/Trip), что и остальная система. Ничего не
          придумывается: неизвестное показывается как неизвестное.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          {OPERATIONAL_STATE_ORDER.map((state) => (
            <span key={state} className={`rounded px-2 py-1 text-xs ${OPERATIONAL_STATE_BADGE[state]}`}>
              {OPERATIONAL_STATE_LABEL_RU[state]}: {fleet.counts[state]}
            </span>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
            <div className="text-neutral-500">Свободных мест</div>
            <div className="text-neutral-200">{fleet.seatsAvailableTotal}</div>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
            <div className="text-neutral-500">Занятых мест</div>
            <div className="text-neutral-200">{fleet.seatsOccupiedTotal}</div>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
            <div className="text-neutral-500">Активных предложений</div>
            <div className="text-neutral-200">{fleet.activeDriverOfferCount}</div>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
            <div className="text-neutral-500">С обратным рейсом / подтв. ETA</div>
            <div className="text-neutral-200">
              {fleet.returnLegOfferCount} / {fleet.confirmedEtaCount}
            </div>
          </div>
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
              {fleet.drivers.map((d) => (
                <tr key={d.driverId} className="border-t border-neutral-800 align-top">
                  <td className="pr-3 py-1.5 text-neutral-300">
                    {d.driverName}
                    {d.vehicle.carPlate && <div className="text-neutral-600">{d.vehicle.carPlate}</div>}
                  </td>
                  <td className="pr-3 py-1.5">
                    <span className={`rounded px-2 py-0.5 ${OPERATIONAL_STATE_BADGE[d.operationalState]}`}>
                      {OPERATIONAL_STATE_LABEL_RU[d.operationalState]}
                    </span>
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
                        {d.etaMinutes} мин
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
          {fleet.drivers.length === 0 && <p className="mt-2 text-neutral-500">Водителей пока нет.</p>}
        </div>
      </section>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">RT OFFICE — спрос ↔ предложение ({pendingRequests.length})</h2>
      </div>
      <p className="mb-4 text-xs text-neutral-500">
        Только чтение. Каждая карточка — реальный вызов resolveDemandAgainstSupply() поверх существующего механизма подбора
        (matching/orchestrate.ts), с учётом уже отклонённых предложений по этой заявке.
      </p>

      <div className="space-y-3">
        {resolutions.map(({ request, resolution }) => (
          <div key={request.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-200">
                {request.origin.nameRu} → {request.destination.nameRu}
              </span>
              <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">{request.status}</span>
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {request.travelDate.toISOString().slice(0, 10)}
              {request.timeWindowStart && <> · {request.timeWindowStart}–{request.timeWindowEnd ?? "?"}</>}
              {" "}· мест: {request.seats} · пассажир: {request.passenger.name ?? request.passengerId}
            </div>

            {!resolution.hasCandidateSupply && (
              <p className="mt-2 text-xs text-neutral-500">Нет проверенного предложения под эту заявку сейчас.</p>
            )}

            {resolution.hasCandidateSupply && (
              <div className="mt-2 space-y-2">
                {resolution.candidates.map((c) => (
                  <div key={c.offerId} className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-300">
                        {c.vehicle.carModel ?? "?"} {c.vehicle.carPlate ?? ""} · мест своб.: {c.seatsAvailable}
                      </span>
                      <span className={`rounded px-2 py-0.5 ${OPERATIONAL_STATE_BADGE[c.operationalState] ?? "bg-neutral-800 text-neutral-400"}`}>
                        {OPERATIONAL_STATE_LABEL_RU[c.operationalState] ?? c.operationalState}
                      </span>
                    </div>
                    <div className="mt-1 text-neutral-500">
                      выезд: {c.departureWindow.travelDate}
                      {c.departureWindow.start && <> {c.departureWindow.start}–{c.departureWindow.end ?? "?"}</>}
                      {c.etaMinutes !== null && <> · ETA: {c.etaMinutes} мин</>}
                    </div>
                    <div className="mt-1 text-neutral-600">
                      offerId: {c.offerId} · driverId: {c.driverId}
                      {c.freshness && <> · источник: {c.freshness.source} ({new Date(c.freshness.asOf).toLocaleString("ru-RU")})</>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {pendingRequests.length === 0 && <p className="text-sm text-neutral-500">Нет нерешённых заявок.</p>}
      </div>
    </div>
  );
}
