import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MiraLanguagesPage() {
  const [byLanguage, byFailureCategory] = await Promise.all([
    db.miraMessage.groupBy({
      by: ["detectedLanguage"],
      _count: true,
      where: { detectedLanguage: { not: null } },
    }),
    db.miraLanguageFailure.groupBy({ by: ["category"], _count: true }),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-base font-semibold">Сообщения по языку</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {byLanguage.length === 0 && <p className="text-sm text-neutral-500">Сообщений ещё не было.</p>}
          {byLanguage.map((g) => (
            <div key={g.detectedLanguage} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className="text-neutral-500">{g.detectedLanguage}</div>
              <div className="text-xl font-semibold">{g._count}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Языковые сбои по категориям</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Источник: Training Failure Loop (MiraLanguageFailure) — Kyrgyz-специфичные и языковые проблемы, ожидающие ревью.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {byFailureCategory.length === 0 && <p className="text-sm text-neutral-500">Сбоев ещё не зафиксировано.</p>}
          {byFailureCategory.map((g) => (
            <div key={g.category} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className="text-neutral-500">{g.category}</div>
              <div className="text-xl font-semibold">{g._count}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
