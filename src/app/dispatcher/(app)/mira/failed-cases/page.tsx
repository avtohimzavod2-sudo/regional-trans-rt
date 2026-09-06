import { db } from "@/lib/db";
import { updateMiraFailureStatusAction } from "@/app/dispatcher/mira-actions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  OPEN: "text-amber-400",
  IN_TRAINING_LOOP: "text-sky-400",
  RESOLVED: "text-emerald-400",
};

export default async function MiraFailedCasesPage() {
  const failures = await db.miraLanguageFailure.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Training Failure Loop</h2>
        <p className="text-sm text-neutral-500">
          Каждый обнаруженный сбой Миры фиксируется здесь. Путь: сбой → санитизация → классификация → human review →
          золотой ответ → кейс бенчмарка → регрессионный тест.
        </p>
      </div>
      <div className="space-y-3">
        {failures.length === 0 && <p className="text-sm text-neutral-500">Сбоев ещё не зафиксировано.</p>}
        {failures.map((f) => (
          <div key={f.id} className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">{f.category}</span>
                <span className={`text-xs font-medium ${STATUS_COLOR[f.status]}`}>{f.status}</span>
                {f.detectedLanguage && <span className="text-xs text-neutral-500">{f.detectedLanguage}</span>}
              </div>
              <span className="text-xs text-neutral-500">{f.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
            </div>
            <div className="mt-2 text-neutral-300">{f.inputSanitized}</div>
            {f.expectedAnswer && (
              <div className="mt-1 text-xs text-neutral-500">Ожидалось: {f.expectedAnswer}</div>
            )}
            {f.actualAnswer && <div className="mt-1 text-xs text-neutral-500">Получено: {f.actualAnswer}</div>}
            {f.notes && <div className="mt-1 text-xs text-neutral-600">{f.notes}</div>}
            {f.status !== "RESOLVED" && (
              <div className="mt-3 flex gap-2">
                {f.status === "OPEN" && (
                  <form action={updateMiraFailureStatusAction.bind(null, f.id, "IN_TRAINING_LOOP")}>
                    <button type="submit" className="rounded bg-sky-700 px-3 py-1 text-xs text-white hover:bg-sky-600">
                      Взять в обучение
                    </button>
                  </form>
                )}
                <form action={updateMiraFailureStatusAction.bind(null, f.id, "RESOLVED")}>
                  <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-xs text-white hover:bg-emerald-600">
                    Отметить решённым
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
