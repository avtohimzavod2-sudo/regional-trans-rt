import { db } from "@/lib/db";
import { AGENT_REGISTRY } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [actionCounts, recentActions] = await Promise.all([
    db.auditLogEntry.groupBy({
      by: ["agentName"],
      where: { agentName: { not: null } },
      _count: true,
    }),
    db.auditLogEntry.findMany({
      where: { agentName: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const countByAgent = new Map(actionCounts.map((c) => [c.agentName, c._count]));

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-base font-semibold">RT AI Workforce — реестр агентов ({AGENT_REGISTRY.length})</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {AGENT_REGISTRY.map((c) => (
            <div key={c.name} className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">{c.name}</span>
                <span className="text-xs text-neutral-500">{countByAgent.get(c.name) ?? 0} действий</span>
              </div>
              <p className="mb-2 text-neutral-300">{c.mission}</p>
              <div className="text-xs text-neutral-500">
                <div>KPI: {c.kpi.join("; ")}</div>
                <div className="mt-1">Эскалация: {c.escalationRules.join("; ")}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Последние действия агентов (по trace)</h2>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-3 py-2">Время</th>
                <th className="px-3 py-2">Агент</th>
                <th className="px-3 py-2">Trace</th>
                <th className="px-3 py-2">Действие</th>
                <th className="px-3 py-2">Объект</th>
              </tr>
            </thead>
            <tbody>
              {recentActions.map((a) => (
                <tr key={a.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-400">{a.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.agentName}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-neutral-500">{a.traceId}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.action}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-400">
                    {a.entityType}:{a.entityId}
                  </td>
                </tr>
              ))}
              {recentActions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-neutral-500">
                    Нет действий агентов.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
