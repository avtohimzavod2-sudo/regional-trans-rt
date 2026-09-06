import { db } from "@/lib/db";
import { ledgerAdjustAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const [balances, recentEntries] = await Promise.all([
    db.rtBalance.findMany({ include: { driver: true }, orderBy: { balanceSom: "asc" } }),
    db.ledgerEntry.findMany({ include: { driver: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-base font-semibold">RT Баланс водителей ({balances.length})</h2>
        <div className="space-y-2">
          {balances.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <span>
                {b.driver.name ?? b.driver.telegramUsername ?? b.driver.telegramUserId} · баланс:{" "}
                <span className={b.balanceSom < 0 ? "font-semibold text-red-400" : "text-neutral-100"}>{b.balanceSom} сом</span>
              </span>
              <div className="flex gap-2">
                <form action={ledgerAdjustAction.bind(null, b.driverId, "TOPUP")} className="flex items-center gap-1">
                  <input
                    name="amountSom"
                    type="number"
                    min={1}
                    placeholder="сумма"
                    className="w-24 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
                    required
                  />
                  <button type="submit" className="rounded bg-emerald-900 px-2 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-800">
                    Пополнить
                  </button>
                </form>
                <form action={ledgerAdjustAction.bind(null, b.driverId, "ADJUSTMENT")} className="flex items-center gap-1">
                  <input
                    name="amountSom"
                    type="number"
                    placeholder="+/- сумма"
                    className="w-24 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
                    required
                  />
                  <input
                    name="description"
                    placeholder="причина"
                    className="w-32 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
                  />
                  <button type="submit" className="rounded bg-blue-900 px-2 py-1 text-xs font-medium text-blue-200 hover:bg-blue-800">
                    Корректировка
                  </button>
                </form>
              </div>
            </div>
          ))}
          {balances.length === 0 && <p className="text-sm text-neutral-500">Нет балансов.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Последние операции ({recentEntries.length})</h2>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-3 py-2">Время</th>
                <th className="px-3 py-2">Водитель</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2">Сумма</th>
                <th className="px-3 py-2">Кто</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map((e) => (
                <tr key={e.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-400">{e.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{e.driver.name ?? e.driver.telegramUserId}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{e.type}</td>
                  <td className={"px-3 py-2 " + (e.amountSom < 0 ? "text-red-400" : "text-emerald-400")}>{e.amountSom}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-400">
                    {e.actorType}
                    {e.actorId ? `:${e.actorId}` : ""}
                  </td>
                </tr>
              ))}
              {recentEntries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-neutral-500">
                    Нет операций.
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
