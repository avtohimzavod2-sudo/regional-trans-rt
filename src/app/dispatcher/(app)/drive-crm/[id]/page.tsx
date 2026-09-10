import Link from "next/link";
import { notFound } from "next/navigation";
import { buildDriverOperationsDetail } from "@/lib/rt-office/driver-detail";
import {
  EVENT_TYPE_BADGE,
  EVENT_TYPE_LABEL_RU,
  OPERATIONAL_STATE_BADGE,
  OPERATIONAL_STATE_LABEL_RU,
} from "@/lib/rt-office/state-labels";

export const dynamic = "force-dynamic";

const VERIFICATION_LABEL_RU: Record<string, string> = {
  PENDING_VERIFICATION: "Ожидает верификации",
  ACTIVE: "Активен",
  SUSPENDED: "Приостановлен",
  BLOCKED: "Заблокирован",
};

// Driver Detail — single-driver deep-dive (DRIVER OPERATIONS CENTER pass).
// Read-only: this page never writes anything. The operational snapshot below
// comes from buildDriverOperationsDetail(), which reuses the exact same
// buildDriverOperationalSnapshot()/selectCurrentContext() functions
// buildLiveFleetPicture() uses — this driver's state can never disagree with
// what the RT OFFICE / Drive CRM overview pages show for the same driver.
export default async function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await buildDriverOperationsDetail(id);
  if (!detail) notFound();

  const { driver, snapshot, recentEvents, recentTrips, recentOffers } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dispatcher/drive-crm" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Drive CRM
        </Link>
        <h2 className="mt-1 text-base font-semibold">DRIVE CRM / ВОДИТЕЛЬ</h2>
      </div>

      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold text-neutral-200">{driver.name}</div>
            <div className="text-sm text-neutral-400">
              {driver.carModel ?? "?"} {driver.carPlate ?? ""}
            </div>
          </div>
          <div className="flex gap-2">
            <span className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300">
              {VERIFICATION_LABEL_RU[driver.verificationStatus] ?? driver.verificationStatus}
            </span>
            <span className={`rounded px-2 py-1 text-xs ${OPERATIONAL_STATE_BADGE[snapshot.operationalState]}`}>
              {OPERATIONAL_STATE_LABEL_RU[snapshot.operationalState]}
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs text-neutral-500">
          снимок на {new Date(snapshot.snapshotAsOf).toLocaleString("ru-RU")}
        </div>
      </section>

      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">ТЕКУЩИЙ РЕЙС / ПРЕДЛОЖЕНИЕ</h3>
        {snapshot.origin && snapshot.destination ? (
          <div className="text-sm text-neutral-300">
            <div>
              {snapshot.origin.nameRu} → {snapshot.destination.nameRu}
            </div>
            {snapshot.departureWindow && (
              <div className="mt-1 text-xs text-neutral-500">
                {snapshot.departureWindow.travelDate}
                {snapshot.departureWindow.start && (
                  <> · {snapshot.departureWindow.start}–{snapshot.departureWindow.end ?? "?"}</>
                )}
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-neutral-500">Trip</div>
                <div className="text-neutral-300">{snapshot.activeTripId ?? "—"}</div>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-neutral-500">Offer</div>
                <div className="text-neutral-300">{snapshot.activeOfferId ?? "—"}</div>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-neutral-500">Места (своб/занят/всего)</div>
                <div className="text-neutral-300">
                  {snapshot.seatsAvailable}/{snapshot.seatsOccupied}/{snapshot.seatsTotal}
                </div>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-neutral-500">Обратный рейс</div>
                <div className="text-neutral-300">{snapshot.isReturnLeg ? "да" : "нет"}</div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Сейчас нет активного рейса или предложения — нормальное состояние.</p>
        )}
      </section>

      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">ETA</h3>
        {snapshot.etaMinutes !== null ? (
          <div className="text-sm text-neutral-300">
            {snapshot.etaMinutes} мин
            {snapshot.etaFreshness && (
              <span className="ml-2 text-xs text-neutral-500">
                источник: {snapshot.etaFreshness.source} · обновлено {new Date(snapshot.etaFreshness.asOf).toLocaleString("ru-RU")} ·{" "}
                <span className={snapshot.etaFreshness.stale ? "text-amber-400" : "text-green-400"}>
                  {snapshot.etaFreshness.stale ? "УСТАРЕЛ" : "СВЕЖИЙ"}
                </span>
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Подтверждённого ETA нет.</p>
        )}
      </section>

      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">ПОЛОМКА</h3>
        {snapshot.breakdownOpen ? (
          <p className="text-sm text-red-400">Есть открытая поломка.</p>
        ) : (
          <p className="text-sm text-neutral-500">Поломок не зафиксировано.</p>
        )}
      </section>

      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">ОПЕРАЦИОННАЯ ИСТОРИЯ ({recentEvents.length})</h3>
        <p className="mb-3 text-xs text-neutral-500">
          Только чтение, append-only — записи никогда не изменяются и не удаляются. Исправление показывается отдельной
          записью, ссылающейся на исходную.
        </p>
        <div className="space-y-1">
          {recentEvents.map((e) => (
            <div key={e.id} className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-400">
              <span className={`mr-2 rounded px-2 py-0.5 ${EVENT_TYPE_BADGE[e.eventType] ?? "bg-neutral-800 text-neutral-400"}`}>
                {EVENT_TYPE_LABEL_RU[e.eventType] ?? e.eventType}
              </span>
              {e.eventType === "OPERATIONAL_ETA" && e.etaMinutes !== null && <>ETA: {e.etaMinutes} мин · </>}
              {e.eventType === "BREAKDOWN_INCIDENT" && <>статус: {e.incidentStatus} · </>}
              {e.eventType === "CORRECTION" && <>исправляет: {e.correctsEventId} · </>}
              источник: {e.source} · {e.createdAt.toLocaleString("ru-RU")}
              <span className="ml-2 text-neutral-600">id: {e.id}</span>
            </div>
          ))}
          {recentEvents.length === 0 && <p className="text-xs text-neutral-500">Событий пока нет.</p>}
        </div>
      </section>

      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">ПОСЛЕДНИЕ РЕЙСЫ / ПРЕДЛОЖЕНИЯ</h3>

        <h4 className="mb-1 text-xs font-semibold text-neutral-500">Рейсы ({recentTrips.length})</h4>
        <div className="mb-3 space-y-1">
          {recentTrips.map((t) => (
            <div key={t.id} className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-400">
              {t.origin.nameRu} → {t.destination.nameRu} · статус: {t.status} · мест: {t.seats}
              <div className="text-neutral-600">
                offerId: {t.offerId} · создан {new Date(t.createdAt).toLocaleString("ru-RU")}
                {t.completedAt && <> · завершён {new Date(t.completedAt).toLocaleString("ru-RU")}</>}
                {t.cancelledAt && <> · отменён {new Date(t.cancelledAt).toLocaleString("ru-RU")}</>}
              </div>
            </div>
          ))}
          {recentTrips.length === 0 && <p className="text-xs text-neutral-500">Рейсов пока нет.</p>}
        </div>

        <h4 className="mb-1 text-xs font-semibold text-neutral-500">Предложения ({recentOffers.length})</h4>
        <div className="space-y-1">
          {recentOffers.map((o) => (
            <div key={o.id} className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-400">
              {o.origin.nameRu} → {o.destination.nameRu} · статус: {o.status} · места (своб/занят/всего): {o.seatsAvailable}/
              {o.seatsOccupied}/{o.seatsTotal}
              {o.isReturnLeg && <span className="ml-1 text-neutral-500">(обратный рейс)</span>}
              <div className="text-neutral-600">
                {o.travelDate}
                {o.timeWindowStart && <> · {o.timeWindowStart}–{o.timeWindowEnd ?? "?"}</>} · создано{" "}
                {new Date(o.createdAt).toLocaleString("ru-RU")}
              </div>
            </div>
          ))}
          {recentOffers.length === 0 && <p className="text-xs text-neutral-500">Предложений пока нет.</p>}
        </div>
      </section>
    </div>
  );
}
