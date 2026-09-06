import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function JolchuErrorsPage() {
  const [failedRequests, failedExecutions] = await Promise.all([
    db.jolchuRequest.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.jolchuProviderExecution.findMany({
      where: { ok: false },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Ошибки</h2>
        <p className="text-sm text-neutral-500">
          Провалившиеся запросы и неудачные попытки провайдеров. Никогда не показывает и не хранит API-ключи.
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Провалившиеся запросы ({failedRequests.length})</h3>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-3 py-2">Время</th>
                <th className="px-3 py-2">Причина</th>
                <th className="px-3 py-2">Ошибка</th>
                <th className="px-3 py-2">Предупреждения</th>
              </tr>
            </thead>
            <tbody>
              {failedRequests.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={4}>
                    Провалившихся запросов ещё не было.
                  </td>
                </tr>
              )}
              {failedRequests.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 text-neutral-400">{r.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td className="px-3 py-2">{r.reasonCode}</td>
                  <td className="px-3 py-2 text-red-400">{r.errorMessage ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.warnings.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Неудачные вызовы провайдеров ({failedExecutions.length})</h3>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-500">
              <tr>
                <th className="px-3 py-2">Время</th>
                <th className="px-3 py-2">Провайдер</th>
                <th className="px-3 py-2">Назначение</th>
                <th className="px-3 py-2">Попытка №</th>
                <th className="px-3 py-2">Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {failedExecutions.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-neutral-500" colSpan={5}>
                    Неудачных вызовов провайдеров ещё не было.
                  </td>
                </tr>
              )}
              {failedExecutions.map((e) => (
                <tr key={e.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 text-neutral-400">{e.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td className="px-3 py-2">{e.provider}</td>
                  <td className="px-3 py-2 text-neutral-500">{e.purpose}</td>
                  <td className="px-3 py-2">{e.attemptOrder}</td>
                  <td className="px-3 py-2 text-red-400">{e.errorMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
