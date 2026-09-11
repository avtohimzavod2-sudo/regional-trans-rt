import { recentProspectHandoffs } from "@/lib/prospecting/handoff";

export const dynamic = "force-dynamic";

const PROSPECT_TYPE_LABEL_RU: Record<string, string> = {
  DRIVER: "Водитель",
  PASSENGER: "Пассажир",
  BUSINESS: "Бизнес",
  DELIVERY_EXECUTOR: "Исполнитель доставки",
  CARGO_CARRIER: "Грузоперевозчик",
};

const STATUS_LABEL_RU: Record<string, string> = {
  READY: "Готово к решению",
  ACCEPTED: "Принято",
  REJECTED: "Отклонено",
  NEEDS_MORE_INFO: "Нужны уточнения",
  DUPLICATE: "Дубликат",
};

const STATUS_BADGE: Record<string, string> = {
  READY: "bg-blue-950 text-blue-300",
  ACCEPTED: "bg-green-950 text-green-300",
  REJECTED: "bg-red-950 text-red-300",
  NEEDS_MORE_INFO: "bg-amber-950 text-amber-300",
  DUPLICATE: "bg-neutral-800 text-neutral-500",
};

// Prospecting Core dispatcher screen — read-only cross-contragent feed onto
// the ONE shared ProspectHandoff table (master spec s.1/s.12). All five
// acquisition contragents (Passenger/Driver/Delivery Executor/Cargo
// Carrier/Business) write handoffs here through the single
// createProspectHandoff entrypoint — this page never aggregates a
// per-contragent duplicate of this feed, it reads recentProspectHandoffs()
// directly. READY never implies acceptance; ownership only transfers to
// targetAgentOrDepartment once a row reaches ACCEPTED.
export default async function ProspectingPage() {
  const handoffs = await recentProspectHandoffs(200);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Prospecting Core — передачи между контрагентами привлечения</h2>
      </div>
      <p className="mb-4 text-xs text-neutral-500">
        Только чтение. Единый журнал ProspectHandoff для всех пяти контрагентов привлечения (Пассажир, Водитель,
        Исполнитель доставки, Грузоперевозчик, Бизнес) — второго такого журнала нет. Статус READY не означает
        принятие: право собственности на отношения переходит принимающей стороне только при статусе ACCEPTED.
      </p>

      <section>
        <h3 className="mb-2 text-sm font-medium text-neutral-300">Передачи ({handoffs.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="pr-3 py-1">Статус</th>
                <th className="pr-3 py-1">Тип</th>
                <th className="pr-3 py-1">От кого</th>
                <th className="pr-3 py-1">Кому</th>
                <th className="pr-3 py-1">Услуга</th>
                <th className="pr-3 py-1">Контакт</th>
                <th className="pr-3 py-1">Когда</th>
              </tr>
            </thead>
            <tbody>
              {handoffs.map((h) => (
                <tr key={h.id} className="border-t border-neutral-800 align-top">
                  <td className="pr-3 py-1.5">
                    <span className={`rounded px-2 py-0.5 ${STATUS_BADGE[h.status] ?? "bg-neutral-800 text-neutral-400"}`}>
                      {STATUS_LABEL_RU[h.status] ?? h.status}
                    </span>
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-400">{PROSPECT_TYPE_LABEL_RU[h.prospectType] ?? h.prospectType}</td>
                  <td className="pr-3 py-1.5 text-neutral-400">{h.sourceAgent}</td>
                  <td className="pr-3 py-1.5 text-neutral-400">{h.targetAgentOrDepartment}</td>
                  <td className="pr-3 py-1.5 text-neutral-300">{h.requestedService}</td>
                  <td className="pr-3 py-1.5 text-neutral-400">{h.contactData}</td>
                  <td className="pr-3 py-1.5 text-neutral-600">{h.createdAt.toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {handoffs.length === 0 && <p className="mt-2 text-sm text-neutral-500">Передач пока нет.</p>}
        </div>
      </section>
    </div>
  );
}
