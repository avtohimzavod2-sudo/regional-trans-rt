import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const entries = await db.auditLogEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold">Журнал действий агента и диспетчера</h2>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="px-3 py-2">Время</th>
              <th className="px-3 py-2">Кто</th>
              <th className="px-3 py-2">Действие</th>
              <th className="px-3 py-2">Объект</th>
              <th className="px-3 py-2">Детали</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 whitespace-nowrap text-neutral-400">{e.createdAt.toISOString()}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {e.actorType}
                  {e.actorId ? `:${e.actorId}` : ""}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{e.action}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {e.entityType}:{e.entityId}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-neutral-400">
                  {e.details ? JSON.stringify(e.details) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
