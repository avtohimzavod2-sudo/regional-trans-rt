import { db } from "@/lib/db";
import { addMiraHumanReviewAction } from "@/app/dispatcher/mira-actions";

export const dynamic = "force-dynamic";

function ScoreInput({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      {label}
      <select name={name} className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100">
        <option value="">—</option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
      </select>
    </label>
  );
}

export default async function MiraReviewsPage() {
  const reviews = await db.miraHumanReview.findMany({ orderBy: { createdAt: "desc" }, take: 30 });

  return (
    <div className="space-y-8">
      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="mb-3 text-base font-semibold">Новое ревью</h2>
        <form action={addMiraHumanReviewAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Сообщение пользователя</label>
            <textarea name="input" required rows={2} className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Ответ Миры</label>
            <textarea name="miraAnswer" required rows={2} className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            <ScoreInput name="grammar" label="Грамматика" />
            <ScoreInput name="naturalness" label="Естественность" />
            <ScoreInput name="meaning" label="Смысл" />
            <ScoreInput name="politeness" label="Вежливость" />
            <ScoreInput name="dialectUnderstanding" label="Диалект" />
            <ScoreInput name="codeSwitchUnderstanding" label="Кодовое смешение" />
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input type="checkbox" name="hallucination" className="h-4 w-4" />
            Обнаружена галлюцинация (выдуманный факт)
          </label>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Комментарий</label>
            <textarea name="comments" rows={2} className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm" />
          </div>
          <button type="submit" className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600">
            Сохранить ревью
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">История ревью ({reviews.length})</h2>
        <div className="space-y-3">
          {reviews.length === 0 && <p className="text-sm text-neutral-500">Ревью ещё не было.</p>}
          {reviews.map((r) => (
            <div key={r.id} className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                <span>{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                <span>{r.reviewedByAdminId ?? "—"}</span>
              </div>
              <div className="mt-2 text-neutral-300">{r.input}</div>
              <div className="mt-1 text-neutral-400">→ {r.miraAnswer}</div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-500">
                <span>Общий балл: {r.overallScore !== null ? r.overallScore.toFixed(1) : "—"}</span>
                {r.hallucination && <span className="text-red-400">Галлюцинация</span>}
              </div>
              {r.comments && <div className="mt-1 text-xs text-neutral-600">{r.comments}</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
