import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  RESOLVED: "text-emerald-400",
  NEEDS_CONFIRMATION: "text-amber-400",
  PARTIAL: "text-amber-400",
  FAILED: "text-red-400",
};

export default async function JolchuRequestsPage() {
  const requests = await db.jolchuRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { resolvedLocations: true },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Запросы Жолчу ({requests.length})</h2>
        <p className="text-sm text-neutral-500">
          Каждый запрос — один вызов resolveRouteIntelligence() от Миры или другого агента. Полный аудит: сырой ввод,
          тип, статус, уверенность, задержка.
        </p>
      </div>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-900 text-neutral-500">
            <tr>
              <th className="px-3 py-2">Время</th>
              <th className="px-3 py-2">Причина</th>
              <th className="px-3 py-2">Тип ввода</th>
              <th className="px-3 py-2">Ввод (санитизирован)</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">Увер.</th>
              <th className="px-3 py-2">Локаций</th>
              <th className="px-3 py-2">Задержка</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-neutral-500" colSpan={8}>
                  Запросов ещё не было.
                </td>
              </tr>
            )}
            {requests.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800 align-top">
                <td className="px-3 py-2 text-neutral-400">{r.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td className="px-3 py-2">{r.reasonCode}</td>
                <td className="px-3 py-2 text-neutral-500">{r.inputType}</td>
                <td className="max-w-xs truncate px-3 py-2 text-neutral-400" title={r.rawInputSanitized}>
                  {r.rawInputSanitized}
                </td>
                <td className={`px-3 py-2 font-medium ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</td>
                <td className="px-3 py-2">{r.confidence !== null ? r.confidence.toFixed(2) : "—"}</td>
                <td className="px-3 py-2">{r.resolvedLocations.length}</td>
                <td className="px-3 py-2 text-neutral-500">{r.latencyMs !== null ? `${r.latencyMs} ms` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
