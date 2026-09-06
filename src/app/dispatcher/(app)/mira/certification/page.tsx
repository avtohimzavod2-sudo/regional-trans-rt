import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatPct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

const STATUS_COLOR: Record<string, string> = {
  TRAINEE: "text-neutral-400",
  CERTIFICATION_PENDING: "text-amber-400",
  CERTIFIED: "text-emerald-400",
  PRODUCTION_APPROVED: "text-emerald-400",
  SUSPENDED: "text-red-400",
};

export default async function MiraCertificationPage() {
  const history = await db.miraCertification.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const current = history[0] ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Сертификационная карточка</div>
        <h2 className="text-xl font-semibold">МИРА · Контактер RT</h2>
        <div className={`mt-3 text-2xl font-bold ${STATUS_COLOR[current?.status ?? "TRAINEE"]}`}>
          {current?.status ?? "TRAINEE"}
        </div>
        <p className="mt-2 max-w-xl text-xs text-neutral-500">
          Автоматический прогон бенчмарка может присвоить только TRAINEE или CERTIFICATION_PENDING — статусы
          CERTIFIED / PRODUCTION_APPROVED присваиваются исключительно человеком вручную и не выставляются этим экраном.
        </p>
        {current && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <div>
              <div className="text-neutral-500">Роль</div>
              <div>{formatPct(current.roleAccuracy)}</div>
            </div>
            <div>
              <div className="text-neutral-500">Маршрут</div>
              <div>{formatPct(current.routeAccuracy)}</div>
            </div>
            <div>
              <div className="text-neutral-500">Дата/время</div>
              <div>{formatPct(current.dateTimeAccuracy)}</div>
            </div>
            <div>
              <div className="text-neutral-500">Места</div>
              <div>{formatPct(current.seatAccuracy)}</div>
            </div>
            <div>
              <div className="text-neutral-500">Телефон</div>
              <div>{formatPct(current.phoneAccuracy)}</div>
            </div>
          </div>
        )}
        {current?.notes && <p className="mt-3 text-xs text-neutral-500">{current.notes}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">История сертификации</h2>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-3 py-2">Время</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Галлюцинации</th>
                <th className="px-3 py-2">Решил</th>
                <th className="px-3 py-2">Примечание</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={5}>
                    Сертификаций ещё не было — запустите бенчмарк.
                  </td>
                </tr>
              )}
              {history.map((c) => (
                <tr key={c.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 text-neutral-400">{c.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className={`px-3 py-2 font-medium ${STATUS_COLOR[c.status]}`}>{c.status}</td>
                  <td className="px-3 py-2">{formatPct(c.hallucinationRate)}</td>
                  <td className="px-3 py-2 text-neutral-500">{c.decidedByAdminId ?? "автоматически"}</td>
                  <td className="max-w-sm truncate px-3 py-2 text-neutral-500">{c.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
