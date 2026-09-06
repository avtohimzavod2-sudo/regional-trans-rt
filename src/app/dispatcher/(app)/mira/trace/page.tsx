import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Mira's public persona is singular — externally there is only "МИРА,
// Regional Trans RT". This tab is the internal-audit exception: it shows
// which RT AI Workforce agent actually produced each traced step, for
// dispatcher/ops review only. Never surface agentName outside this UI.
export default async function MiraTracePage() {
  const entries = await db.auditLogEntry.findMany({
    where: { OR: [{ agentName: "MIRA" }, { entityType: { in: ["MiraConversation", "MiraMessage", "MiraBenchmarkRun"] } }] },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Трасса агентов</h2>
        <p className="text-sm text-neutral-500">
          Внутренняя атрибуция для аудита: какой агент RT AI Workforce фактически участвовал в каждом шаге. Наружу
          Мира всегда выступает как единая персона.
        </p>
      </div>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-900 text-neutral-500">
            <tr>
              <th className="px-3 py-2">Время</th>
              <th className="px-3 py-2">Агент</th>
              <th className="px-3 py-2">Действие</th>
              <th className="px-3 py-2">Сущность</th>
              <th className="px-3 py-2">Trace ID</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-neutral-500" colSpan={5}>
                  Записей ещё нет.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800 align-top">
                <td className="px-3 py-2 text-neutral-400">{e.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td className="px-3 py-2">{e.agentName ?? e.actorType}</td>
                <td className="px-3 py-2">{e.action}</td>
                <td className="px-3 py-2 text-neutral-500">
                  {e.entityType}:{e.entityId}
                </td>
                <td className="px-3 py-2 text-neutral-600">{e.traceId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
