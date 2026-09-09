import { computeMarketGap } from "@/lib/rt-office/market-gap";

export const dynamic = "force-dynamic";

const PRIORITY_LABEL_RU: Record<string, string> = {
  HIGH_DRIVER_ACQUISITION_NEED: "Нужны водители",
  BALANCED: "Сбалансировано",
  PASSENGER_ACQUISITION_NEED: "Нужны пассажиры",
};

const PRIORITY_BADGE: Record<string, string> = {
  HIGH_DRIVER_ACQUISITION_NEED: "bg-red-950 text-red-300",
  BALANCED: "bg-neutral-800 text-neutral-300",
  PASSENGER_ACQUISITION_NEED: "bg-blue-950 text-blue-300",
};

// Market Gap dispatcher screen — read-only view onto RT OFFICE's live
// demand<->supply aggregate (rt-office/market-gap.ts). This is the single
// source of truth the Driver/Passenger Contractors and Mira's
// driverDemandProposition all read from; this page computes nothing of its
// own and never shows a hardcoded example number (spec's illustrative
// 23/9/-14 is not this page's output — it is always computeMarketGap()'s
// live result).
export default async function MarketGapPage() {
  const gap = await computeMarketGap();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Market Gap — спрос ↔ предложение по сети</h2>
      </div>
      <p className="mb-4 text-xs text-neutral-500">
        Только чтение. Единственный источник истины для приоритета найма водителей/пассажиров — тот же
        computeMarketGap(), который используют Driver/Passenger Contractor и подсказка Mira. Число не захардкожено —
        всегда живой расчёт по TripRequest/DriverOffer за окно {gap.windowDays} дн.
      </p>

      <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-300">Сеть в целом (без привязки к коридору)</span>
          <span className={`rounded px-2 py-0.5 text-xs ${PRIORITY_BADGE[gap.priority] ?? "bg-neutral-800 text-neutral-300"}`}>
            {PRIORITY_LABEL_RU[gap.priority] ?? gap.priority}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-semibold text-neutral-100">{gap.demandSeats}</div>
            <div className="text-xs text-neutral-500">спрос (мест)</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-neutral-100">{gap.supplySeats}</div>
            <div className="text-xs text-neutral-500">предложение (мест)</div>
          </div>
          <div>
            <div className={`text-2xl font-semibold ${gap.gapSeats < 0 ? "text-red-400" : gap.gapSeats > 0 ? "text-blue-400" : "text-neutral-100"}`}>
              {gap.gapSeats > 0 ? `+${gap.gapSeats}` : gap.gapSeats}
            </div>
            <div className="text-xs text-neutral-500">разрыв (предложение − спрос)</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-neutral-600">
          окно: {gap.windowDays} дн · по состоянию на: {new Date(gap.asOf).toLocaleString("ru-RU")}
        </div>
      </div>
    </div>
  );
}
