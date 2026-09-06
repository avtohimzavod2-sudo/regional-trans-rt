import { db } from "@/lib/db";
import { overrideDriverCategoryAction } from "../../actions";

export const dynamic = "force-dynamic";

const CATEGORIES = ["UNKNOWN", "OCCASIONAL", "REGULAR", "ANCHOR", "DISPATCHER_FLEET"] as const;

const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  UNKNOWN: "неизвестно",
  OCCASIONAL: "разовый",
  REGULAR: "регулярный",
  ANCHOR: "опорный",
  DISPATCHER_FLEET: "диспетчер/парк",
};

export default async function DriversPage() {
  const drivers = await db.driver.findMany({
    orderBy: [{ repeatScore: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold">Driver Intelligence — все водители ({drivers.length})</h2>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="px-3 py-2">Водитель</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">RT Score</th>
              <th className="px-3 py-2">Категория</th>
              <th className="px-3 py-2">Рейтинг</th>
              <th className="px-3 py-2">Жалобы</th>
              <th className="px-3 py-2">Последний раз замечен</th>
              <th className="px-3 py-2">Изменить категорию</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 whitespace-nowrap">{d.name ?? d.telegramUsername ?? d.telegramUserId}</td>
                <td className="px-3 py-2 whitespace-nowrap text-neutral-400">{d.status}</td>
                <td className="px-3 py-2">{d.repeatScore}</td>
                <td className="px-3 py-2 whitespace-nowrap">{CATEGORY_LABEL[d.category]}</td>
                <td className="px-3 py-2">{d.ratingAvg != null ? `${d.ratingAvg.toFixed(1)} (${d.ratingCount})` : "—"}</td>
                <td className="px-3 py-2">{d.complaintsCount}</td>
                <td className="px-3 py-2 whitespace-nowrap text-neutral-400">
                  {d.lastScoutSeenAt ? d.lastScoutSeenAt.toISOString().slice(0, 10) : "—"}
                </td>
                <td className="px-3 py-2">
                  <form action={overrideDriverCategoryAction.bind(null, d.id)} className="flex items-center gap-2">
                    <select
                      name="category"
                      defaultValue={d.category}
                      className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded bg-blue-900 px-2 py-1 text-xs font-medium text-blue-200 hover:bg-blue-800">
                      Сохранить
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {drivers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-neutral-500">
                  Нет водителей.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
