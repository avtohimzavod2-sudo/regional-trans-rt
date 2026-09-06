import { db } from "@/lib/db";
import { getMiraProviderStatus } from "@/lib/mira/providers/model-provider";
import { getMiraAudioProvider } from "@/lib/mira/providers/audio-provider";
import { getMiraVoiceOutputProvider } from "@/lib/mira/providers/voice-output-provider";

export const dynamic = "force-dynamic";

export default async function MiraProviderPage() {
  const status = getMiraProviderStatus();
  const audioProvider = getMiraAudioProvider();
  const voiceProvider = getMiraVoiceOutputProvider();

  const recentCalls = await db.miraProviderCall.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const failedCount = recentCalls.filter((c) => !c.ok).length;
  const totalCost = recentCalls.reduce((sum, c) => sum + (c.estimatedCostUsd ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-500">Текстовая модель (MiraModelProvider)</div>
          <div className="mt-1 text-lg font-semibold">{status.configuredProvider}</div>
          <div className="text-sm text-neutral-400">{status.modelId}</div>
          <div className={`mt-2 text-xs ${status.ready ? "text-emerald-400" : "text-amber-400"}`}>
            {status.ready ? "Готов" : `Не готов: ${status.reason}`}
          </div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-500">Аудио (AudioUnderstandingProvider)</div>
          <div className="mt-1 text-lg font-semibold">{audioProvider.providerName}</div>
          <div className="mt-2 text-xs text-neutral-500">Голосовые сообщения пока не подключены к вебхукам (архитектурная заглушка).</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-500">Голосовой ответ (MiraVoiceOutputProvider)</div>
          <div className="mt-1 text-lg font-semibold">{voiceProvider.providerName}</div>
          <div className="mt-2 text-xs text-neutral-500">Текст всегда остаётся резервным каналом ответа.</div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Последние вызовы провайдера ({recentCalls.length})</h2>
        <div className="mb-2 text-xs text-neutral-500">
          Ошибок: {failedCount} · Оценочная стоимость (сумма показанных): ${totalCost.toFixed(4)}
        </div>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-3 py-2">Время</th>
                <th className="px-3 py-2">Провайдер / модель</th>
                <th className="px-3 py-2">Назначение</th>
                <th className="px-3 py-2">Задержка</th>
                <th className="px-3 py-2">Токены</th>
                <th className="px-3 py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {recentCalls.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={6}>
                    Вызовов ещё не было.
                  </td>
                </tr>
              )}
              {recentCalls.map((c) => (
                <tr key={c.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 text-neutral-400">{c.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td className="px-3 py-2">
                    {c.provider} / {c.model}
                  </td>
                  <td className="px-3 py-2">{c.purpose}</td>
                  <td className="px-3 py-2">{c.latencyMs ? `${c.latencyMs} ms` : "—"}</td>
                  <td className="px-3 py-2">
                    {c.promptTokens ?? "—"} / {c.completionTokens ?? "—"}
                  </td>
                  <td className={`px-3 py-2 ${c.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {c.ok ? "ok" : (c.errorMessage ?? "ошибка")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
