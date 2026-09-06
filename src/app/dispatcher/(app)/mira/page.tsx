import { db } from "@/lib/db";
import { getMiraProviderStatus } from "@/lib/mira/providers/model-provider";
import { MAX_LEVEL } from "@/lib/mira/training/levels";
import { TRAINING_CORPUS } from "@/lib/mira/training/corpus";
import { BENCHMARK_CASES } from "@/lib/mira/training/benchmark-cases";

export const dynamic = "force-dynamic";

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

export default async function MiraOverviewPage() {
  const [conversationsByStatus, totalMessages, latestCertification, latestRun, openFailures, providerCallCount] =
    await Promise.all([
      db.miraConversation.groupBy({ by: ["status"], _count: true }),
      db.miraMessage.count(),
      db.miraCertification.findFirst({ orderBy: { createdAt: "desc" } }),
      db.miraBenchmarkRun.findFirst({ orderBy: { startedAt: "desc" } }),
      db.miraLanguageFailure.count({ where: { status: "OPEN" } }),
      db.miraProviderCall.count(),
    ]);

  const providerStatus = getMiraProviderStatus();
  const totalConversations = conversationsByStatus.reduce((sum, g) => sum + g._count, 0);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Диалогов" value={totalConversations} hint={`${totalMessages} сообщений`} />
        <StatCard
          label="Провайдер ИИ"
          value={providerStatus.configuredProvider}
          hint={providerStatus.ready ? providerStatus.modelId : (providerStatus.reason ?? "не настроен")}
        />
        <StatCard
          label="Сертификация"
          value={latestCertification?.status ?? "TRAINEE"}
          hint={latestCertification ? latestCertification.createdAt.toISOString().slice(0, 10) : "прогонов ещё не было"}
        />
        <StatCard label="Открытых ошибок" value={openFailures} hint="Training Failure Loop" />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Диалоги по статусу</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {conversationsByStatus.length === 0 && <p className="text-sm text-neutral-500">Диалогов ещё не было.</p>}
          {conversationsByStatus.map((g) => (
            <div key={g.status} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className="text-neutral-500">{g.status}</div>
              <div className="text-xl font-semibold">{g._count}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Последний прогон бенчмарка</h2>
        {latestRun ? (
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm">
            <div className="mb-2 text-neutral-400">
              {latestRun.provider} / {latestRun.model} · {latestRun.passedCases}/{latestRun.totalCases} пройдено ·{" "}
              {latestRun.startedAt.toISOString().slice(0, 16).replace("T", " ")}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400 md:grid-cols-5">
              <div>Роль: {formatPct(latestRun.roleAccuracy)}</div>
              <div>Маршрут: {formatPct(latestRun.routeAccuracy)}</div>
              <div>Дата/время: {formatPct(latestRun.dateTimeAccuracy)}</div>
              <div>Места: {formatPct(latestRun.seatAccuracy)}</div>
              <div>Телефон: {formatPct(latestRun.phoneAccuracy)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Бенчмарк ещё не запускался. См. вкладку «Бенчмарк».</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Обучающая система</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
          <StatCard label="Уровней curriculum" value={MAX_LEVEL} />
          <StatCard label="Примеров в корпусе (seed)" value={TRAINING_CORPUS.length} hint="синтетические, не из реальных диалогов" />
          <StatCard label="Кейсов бенчмарка" value={BENCHMARK_CASES.length} />
          <StatCard label="Вызовов провайдера" value={providerCallCount} />
        </div>
      </section>
    </div>
  );
}

function formatPct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}
