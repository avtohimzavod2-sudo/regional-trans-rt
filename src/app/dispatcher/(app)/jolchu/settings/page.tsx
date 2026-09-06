import {
  getConfirmationConfidenceThreshold,
  getLastMileThresholdKm,
  getDataRefreshIntervalDays,
  getMockRoadDistanceFactor,
  getMockAverageSpeedKmh,
} from "@/lib/jolchu/config";
import { getJolchuModelProviderStatus } from "@/lib/jolchu/providers/model-provider";
import { getRouteProviderStatus } from "@/lib/jolchu/route-providers/route-provider";

export const dynamic = "force-dynamic";

function Row({ label, value, envVar }: { label: string; value: string; envVar: string }) {
  return (
    <tr className="border-t border-neutral-800">
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 font-mono text-neutral-300">{value}</td>
      <td className="px-3 py-2 text-neutral-600">
        <code>{envVar}</code>
      </td>
    </tr>
  );
}

export default function JolchuSettingsPage() {
  const modelStatus = getJolchuModelProviderStatus();
  const routeStatus = getRouteProviderStatus();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Настройки / конфигурация</h2>
        <p className="text-sm text-neutral-500">
          Только для чтения — это переменные окружения, а не редактируемые в БД настройки. Чтобы изменить, обновите
          <code className="mx-1">.env</code> и перезапустите сервис.
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Пороги и политика</h3>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-3 py-2">Параметр</th>
                <th className="px-3 py-2">Значение</th>
                <th className="px-3 py-2">ENV</th>
              </tr>
            </thead>
            <tbody>
              <Row
                label="Порог уверенности для подтверждения"
                value={getConfirmationConfidenceThreshold().toFixed(2)}
                envVar="JOLCHU_CONFIRMATION_CONFIDENCE_THRESHOLD"
              />
              <Row
                label="Порог Last Mile, км"
                value={getLastMileThresholdKm().toFixed(1)}
                envVar="JOLCHU_LAST_MILE_THRESHOLD_KM"
              />
              <Row
                label="Интервал обновления справочных данных, дней"
                value={String(getDataRefreshIntervalDays())}
                envVar="JOLCHU_DATA_REFRESH_INTERVAL_DAYS"
              />
              <Row
                label="Mock: коэффициент дороги к прямой"
                value={getMockRoadDistanceFactor().toFixed(2)}
                envVar="JOLCHU_MOCK_ROAD_DISTANCE_FACTOR"
              />
              <Row
                label="Mock: средняя скорость, км/ч"
                value={String(getMockAverageSpeedKmh())}
                envVar="JOLCHU_MOCK_AVERAGE_SPEED_KMH"
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="mb-2 text-sm font-semibold">Модель понимания языка</h3>
          <div className="text-sm text-neutral-400">
            <div>
              <code>JOLCHU_MODEL_PROVIDER</code> = {modelStatus.configuredProvider}
            </div>
            <div>
              <code>JOLCHU_PRIMARY_MODEL</code> = {modelStatus.modelId}
            </div>
            <div>Готов: {modelStatus.ready ? "да" : `нет — ${modelStatus.reason}`}</div>
          </div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="mb-2 text-sm font-semibold">Провайдер маршрутов</h3>
          <div className="text-sm text-neutral-400">
            <div>
              <code>JOLCHU_ROUTE_PROVIDER</code> = {routeStatus.configuredProvider}
            </div>
            <div>
              <code>JOLCHU_ROUTE_FALLBACK_PROVIDER</code> = {routeStatus.fallbackProvider ?? "нет"}
            </div>
            <div>Готов: {routeStatus.ready ? "да" : `нет — ${routeStatus.reason}`}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
