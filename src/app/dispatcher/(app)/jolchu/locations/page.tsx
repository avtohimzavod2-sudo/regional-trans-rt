import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Precise coordinates are sensitive operational data — this page is
// dispatcher-only (behind the dispatcher session gate) and never exposed
// publicly. See CLAUDE/AGENTS directives on treating coordinates as
// sensitive.
export default async function JolchuLocationsPage() {
  const locations = await db.jolchuResolvedLocation.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Разрешённые локации ({locations.length})</h2>
        <p className="text-sm text-neutral-500">
          Каждая строка — один вход (origin/destination/waypoint), приведённый к координатам через RouteProvider или
          прямой парсинг. Координаты — чувствительные данные, видны только диспетчеру.
        </p>
      </div>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-900 text-neutral-500">
            <tr>
              <th className="px-3 py-2">Время</th>
              <th className="px-3 py-2">Роль</th>
              <th className="px-3 py-2">Тип источника</th>
              <th className="px-3 py-2">Адрес</th>
              <th className="px-3 py-2">Координаты</th>
              <th className="px-3 py-2">Провайдер</th>
              <th className="px-3 py-2">Увер.</th>
              <th className="px-3 py-2">Неоднозн.</th>
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-neutral-500" colSpan={8}>
                  Локаций ещё не было.
                </td>
              </tr>
            )}
            {locations.map((l) => (
              <tr key={l.id} className="border-t border-neutral-800 align-top">
                <td className="px-3 py-2 text-neutral-400">{l.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td className="px-3 py-2">{l.role}</td>
                <td className="px-3 py-2 text-neutral-500">{l.sourceType}</td>
                <td className="max-w-xs truncate px-3 py-2" title={l.formattedAddress ?? undefined}>
                  {l.formattedAddress ?? l.landmark ?? l.settlement ?? "—"}
                </td>
                <td className="px-3 py-2 text-neutral-400">
                  {l.latitude !== null && l.longitude !== null ? `${l.latitude.toFixed(4)}, ${l.longitude.toFixed(4)}` : "не определены"}
                </td>
                <td className="px-3 py-2 text-neutral-500">{l.provider}</td>
                <td className="px-3 py-2">{l.confidence.toFixed(2)}</td>
                <td className={`px-3 py-2 ${l.ambiguity ? "text-amber-400" : "text-neutral-600"}`}>{l.ambiguity ? "да" : "нет"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
