import { db } from "@/lib/db";
import { resolveDemandAgainstSupply } from "@/lib/rt-office/facts";
import { internalSupplyView } from "@/lib/rt-office/bridge";

export const dynamic = "force-dynamic";

const OPERATIONAL_STATE_LABEL_RU: Record<string, string> = {
  AVAILABLE: "Доступен",
  PLANNED: "Запланирован",
  WAITING_DEPARTURE: "Ожидает выезда",
  EN_ROUTE: "В пути",
  DELAYED: "Задержка",
  ARRIVED: "Прибыл",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
  BREAKDOWN: "Поломка",
  OFFLINE: "Не на связи",
};

const OPERATIONAL_STATE_BADGE: Record<string, string> = {
  AVAILABLE: "bg-neutral-800 text-neutral-300",
  PLANNED: "bg-neutral-800 text-neutral-300",
  WAITING_DEPARTURE: "bg-blue-950 text-blue-300",
  EN_ROUTE: "bg-blue-950 text-blue-300",
  DELAYED: "bg-amber-950 text-amber-300",
  ARRIVED: "bg-green-950 text-green-300",
  COMPLETED: "bg-green-950 text-green-300",
  CANCELLED: "bg-neutral-800 text-neutral-500",
  BREAKDOWN: "bg-red-950 text-red-300",
  OFFLINE: "bg-neutral-800 text-neutral-500",
};

// RT OFFICE dispatcher screen — read-only view onto RT OFFICE's demand<->supply
// fact resolution (spec s.4/s.5). This page never mutates anything: it calls
// the exact same resolveDemandAgainstSupply() Mira's conversation flow calls,
// through internalSupplyView() for the full (non-passenger-redacted) detail
// dispatchers need — offerId/driverId/vehicle identity/fact freshness. There
// is no separate "dispatcher matching" logic here, per the Founder's MATCHING
// directive: one exclusion-aware resolution path, reused everywhere.
export default async function RtOfficePage() {
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
