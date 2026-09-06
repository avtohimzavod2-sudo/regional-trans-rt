import { db } from "@/lib/db";
import { resolveSupportCaseAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const cases = await db.supportCase.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] } },
    include: { trip: { include: { driver: true, passenger: true } } },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold">Открытые обращения ({cases.length})</h2>
      <div className="space-y-2">
        {cases.map((c) => (
          <div key={c.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span>
                {c.caseType}
                {c.status === "ESCALATED" && (
                  <span className="ml-2 rounded bg-amber-900 px-1.5 py-0.5 text-xs text-amber-200">эскалировано</span>
                )}
                {c.trip && (
                  <span className="ml-2 text-neutral-400">
                    · водитель: {c.trip.driver.name ?? c.trip.driver.telegramUserId} · пассажир:{" "}
                    {c.trip.passenger.name ?? c.trip.passenger.whatsappId}
                  </span>
                )}
              </span>
              <span className="text-xs text-neutral-500">{c.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
            </div>
            {c.description && <div className="mb-2 text-neutral-300">{c.description}</div>}
            <form action={resolveSupportCaseAction.bind(null, c.id)} className="flex items-center gap-2">
              <input
                name="resolution"
                placeholder="решение / комментарий"
                className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
                required
              />
              <button type="submit" className="rounded bg-blue-900 px-2 py-1 text-xs font-medium text-blue-200 hover:bg-blue-800">
                Решено
              </button>
            </form>
          </div>
        ))}
        {cases.length === 0 && <p className="text-sm text-neutral-500">Нет открытых обращений.</p>}
      </div>
    </div>
  );
}
