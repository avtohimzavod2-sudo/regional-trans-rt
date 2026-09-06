import { getMiraAudioProvider } from "@/lib/mira/providers/audio-provider";
import { getMiraVoiceOutputProvider } from "@/lib/mira/providers/voice-output-provider";

export const dynamic = "force-dynamic";

export default async function MiraAudioPage() {
  const audioProvider = getMiraAudioProvider();
  const voiceProvider = getMiraVoiceOutputProvider();

  const sample = await audioProvider.transcribe({ audioRef: "diagnostic-sample", hintLanguage: "KY" });
  const synthesis = await voiceProvider.synthesize({
    text: "Диагностический тест голосового вывода",
    language: "RU",
    conversationId: "diagnostic",
  });

  return (
    <div className="space-y-6">
      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="mb-2 text-base font-semibold">Распознавание речи (AudioUnderstandingProvider)</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Приём голосовых сообщений из Telegram/WhatsApp пока не подключён к вебхукам — это архитектурная заглушка,
          не ошибка. Ниже — диагностический вызов текущего провайдера ({audioProvider.providerName}).
        </p>
        <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Провайдер</dt>
            <dd>{sample.provider}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Язык</dt>
            <dd>
              {sample.language} (уверенность {(sample.languageConfidence * 100).toFixed(0)}%)
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Уверенность распознавания</dt>
            <dd>{(sample.confidence * 100).toFixed(0)}%</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Неуверенные фрагменты</dt>
            <dd>{sample.uncertainSegments.join(", ") || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="mb-2 text-base font-semibold">Голосовой ответ (MiraVoiceOutputProvider)</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Текст всегда остаётся резервным каналом ответа — Мира не молчит, ожидая голос, которого ещё нет.
        </p>
        <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Провайдер</dt>
            <dd>{synthesis.provider}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Реализовано</dt>
            <dd>{synthesis.implemented ? "да" : "нет — используется текст"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
