import { db } from "@/lib/db";
import {
  verifyDriverAction,
  blockDriverAction,
  manualProposeAction,
  dispatcherOverrideDriverResponseAction,
  dispatcherOverridePassengerResponseAction,
  manualCompleteTripAction,
  cancelMatchAction,
} from "../actions";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function ActionButton({
  action,
  label,
  variant = "default",
}: {
  action: () => Promise<void>;
  label: string;
  variant?: "default" | "danger";
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={
          "rounded px-2 py-1 text-xs font-medium " +
          (variant === "danger" ? "bg-red-900 text-red-200 hover:bg-red-800" : "bg-blue-900 text-blue-200 hover:bg-blue-800")
        }
      >
        {label}
      </button>
    </form>
  );
}

export default async function DispatcherPage() {
  const [pendingDrivers, pendingRequests, openOffers, activeMatches, scheduledTrips] = await Promise.all([
    db.driver.findMany({ where: { status: "PENDING_VERIFICATION" }, orderBy: { createdAt: "desc" } }),
    db.tripRequest.findMany({
      where: { status: { in: ["PENDING", "MATCHING"] } },
      include: { origin: true, destination: true, passenger: true },
      orderBy: { createdAt: "desc" },
    }),
    db.driverOffer.findMany({
      where: { status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
      include: { origin: true, destination: true, driver: true },
      orderBy: { createdAt: "desc" },
    }),
    db.match.findMany({
      where: { status: { in: ["AWAITING_DRIVER", "AWAITING_PASSENGER", "PROPOSED_TO_DRIVER"] } },
      include: {
        tripRequest: { include: { origin: true, destination: true, passenger: true } },
        driverOffer: { include: { driver: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.trip.findMany({
      where: { status: "SCHEDULED" },
      include: { driver: true, passenger: true, driverOffer: { include: { origin: true, destination: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-base font-semibold">Водители на верификации ({pendingDrivers.length})</h2>
        <div className="space-y-2">
          {pendingDrivers.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <span>
                {d.name ?? d.telegramUsername ?? d.telegramUserId} · tg:{d.telegramUserId} · авто: {d.carModel ?? "—"}
              </span>
              <div className="flex gap-2">
                <ActionButton action={verifyDriverAction.bind(null, d.id)} label="Верифицировать" />
                <ActionButton action={blockDriverAction.bind(null, d.id)} label="Заблокировать" variant="danger" />
              </div>
            </div>
          ))}
          {pendingDrivers.length === 0 && <p className="text-sm text-neutral-500">Нет водителей на верификации.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Заявки пассажиров в ожидании ({pendingRequests.length})</h2>
        <div className="space-y-2">
          {pendingRequests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <span>
                {r.origin.nameRu} → {r.destination.nameRu} · {fmtDate(r.travelDate)} · мест: {r.seats} · статус: {r.status}
              </span>
              <ActionButton action={manualProposeAction.bind(null, r.id)} label="Подобрать вручную" />
            </div>
          ))}
          {pendingRequests.length === 0 && <p className="text-sm text-neutral-500">Нет заявок в ожидании.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Открытые предложения водителей ({openOffers.length})</h2>
        <div className="space-y-2">
          {openOffers.map((o) => (
            <div key={o.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              {o.origin.nameRu} → {o.destination.nameRu} · {fmtDate(o.travelDate)} · свободно мест: {o.seatsAvailable}/{o.seatsTotal} ·
              водитель: {o.driver.name ?? o.driver.telegramUsername ?? o.driver.telegramUserId}
              {o.isReturnLeg && <span className="ml-2 rounded bg-amber-900 px-1.5 py-0.5 text-xs text-amber-200">обратный рейс</span>}
            </div>
          ))}
          {openOffers.length === 0 && <p className="text-sm text-neutral-500">Нет открытых предложений.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Активные предложения соответствия ({activeMatches.length})</h2>
        <div className="space-y-2">
          {activeMatches.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <span>
                {m.tripRequest.origin.nameRu} → {m.tripRequest.destination.nameRu} · {fmtDate(m.tripRequest.travelDate)} · статус:{" "}
                {m.status} · водитель: {m.driverOffer.driver.name ?? m.driverOffer.driver.telegramUserId}
              </span>
              <div className="flex gap-2">
                {m.status === "AWAITING_DRIVER" && (
                  <>
                    <ActionButton action={dispatcherOverrideDriverResponseAction.bind(null, m.id, true)} label="За водителя: Да" />
                    <ActionButton
                      action={dispatcherOverrideDriverResponseAction.bind(null, m.id, false)}
                      label="За водителя: Нет"
                      variant="danger"
                    />
                  </>
                )}
                {m.status === "AWAITING_PASSENGER" && (
                  <>
                    <ActionButton
                      action={dispatcherOverridePassengerResponseAction.bind(null, m.id, true)}
                      label="За пассажира: Да"
                    />
                    <ActionButton
                      action={dispatcherOverridePassengerResponseAction.bind(null, m.id, false)}
                      label="За пассажира: Нет"
                      variant="danger"
                    />
                  </>
                )}
                <ActionButton action={cancelMatchAction.bind(null, m.id, "dispatcher_manual_cancel")} label="Отменить" variant="danger" />
              </div>
            </div>
          ))}
          {activeMatches.length === 0 && <p className="text-sm text-neutral-500">Нет активных предложений.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Запланированные поездки ({scheduledTrips.length})</h2>
        <div className="space-y-2">
          {scheduledTrips.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <span>
                {t.driverOffer.origin.nameRu} → {t.driverOffer.destination.nameRu} · водитель:{" "}
                {t.driver.name ?? t.driver.telegramUserId} · пассажир: {t.passenger.name ?? t.passenger.whatsappId}
              </span>
              <ActionButton action={manualCompleteTripAction.bind(null, t.id)} label="Завершить поездку" />
            </div>
          ))}
          {scheduledTrips.length === 0 && <p className="text-sm text-neutral-500">Нет запланированных поездок.</p>}
        </div>
      </section>
    </div>
  );
}
