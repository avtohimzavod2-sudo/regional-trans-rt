import { db } from "@/lib/db";
import { scoutLinkAction, scoutRejectAction, scoutCreateNewAction } from "../../actions";

export const dynamic = "force-dynamic";

interface MatchCandidate {
  driverId: string;
  confidence: number;
  signals: string[];
}

export default async function ScoutPage() {
  const candidates = await db.scoutCandidate.findMany({
    where: { reviewStatus: "PENDING_REVIEW" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const driverIds = Array.from(
    new Set(candidates.flatMap((c) => ((c.matchCandidates as unknown as MatchCandidate[] | null) ?? []).map((m) => m.driverId))),
  );
  const drivers = driverIds.length > 0 ? await db.driver.findMany({ where: { id: { in: driverIds } } }) : [];
  const driverById = new Map(drivers.map((d) => [d.id, d]));

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold">RT Scout — кандидаты на проверку ({candidates.length})</h2>
      <div className="space-y-3">
        {candidates.map((c) => {
          const topMatches = (c.matchCandidates as unknown as MatchCandidate[] | null) ?? [];
          return (
            <div key={c.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className="mb-2 text-neutral-300">
                источник: {c.sourceType} · {c.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </div>
              <div className="mb-2 whitespace-pre-wrap text-neutral-100">{c.sourceText}</div>
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
                {c.rawPhone && <span>тел: {c.rawPhone}</span>}
                {c.rawTelegramUsername && <span>tg: @{c.rawTelegramUsername}</span>}
                {c.rawName && <span>имя: {c.rawName}</span>}
                {c.rawCarModel && <span>авто: {c.rawCarModel}</span>}
                {c.rawCarPlate && <span>номер: {c.rawCarPlate}</span>}
              </div>

              {topMatches.length > 0 && (
                <div className="mb-3 space-y-1">
                  <div className="text-xs text-neutral-500">возможные совпадения:</div>
                  {topMatches.map((m) => {
                    const driver = driverById.get(m.driverId);
                    return (
                      <div key={m.driverId} className="text-xs text-neutral-400">
                        {driver?.name ?? driver?.telegramUsername ?? m.driverId} · уверенность: {(m.confidence * 100).toFixed(0)}% ·{" "}
                        {m.signals.join(", ")}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <form action={scoutLinkAction.bind(null, c.id)} className="flex items-center gap-2">
                  <input
                    name="driverId"
                    placeholder="ID водителя"
                    defaultValue={topMatches[0]?.driverId ?? ""}
                    className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
                  />
                  <button type="submit" className="rounded bg-blue-900 px-2 py-1 text-xs font-medium text-blue-200 hover:bg-blue-800">
                    Связать
                  </button>
                </form>

                <form action={scoutCreateNewAction.bind(null, c.id)} className="flex items-center gap-2">
                  <input
                    name="telegramUserId"
                    placeholder="Telegram ID нового водителя"
                    className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
                  />
                  <button type="submit" className="rounded bg-emerald-900 px-2 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-800">
                    Создать нового
                  </button>
                </form>

                <form action={scoutRejectAction.bind(null, c.id)}>
                  <button type="submit" className="rounded bg-red-900 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-800">
                    Отклонить
                  </button>
                </form>
              </div>
            </div>
          );
        })}
        {candidates.length === 0 && <p className="text-sm text-neutral-500">Нет кандидатов на проверку.</p>}
      </div>
    </div>
  );
}
