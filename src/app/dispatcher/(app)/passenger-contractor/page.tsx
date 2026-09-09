import { recentPassengerAcquisitionOutreach, activePassengerProspects } from "@/lib/passenger-contractor/bridge";

export const dynamic = "force-dynamic";

const PROSPECT_STATUS_LABEL_RU: Record<string, string> = {
  NEW: "Новый",
  CONTACTED: "Связались",
  QUALIFIED: "Квалифицирован",
  CONVERTED: "Стал пассажиром",
  DECLINED: "Отказ",
  SPAM: "Спам",
};

const PROSPECT_STATUS_BADGE: Record<string, string> = {
  NEW: "bg-neutral-800 text-neutral-300",
  CONTACTED: "bg-blue-950 text-blue-300",
  QUALIFIED: "bg-blue-950 text-blue-300",
  CONVERTED: "bg-green-950 text-green-300",
  DECLINED: "bg-neutral-800 text-neutral-500",
  SPAM: "bg-neutral-800 text-neutral-500",
};

const OUTREACH_STATUS_LABEL_RU: Record<string, string> = {
  SENT: "Отправлено",
  DRY_RUN: "Тестовый прогон",
  SANDBOX: "Песочница",
  NO_PROVIDER_CONFIGURED: "Провайдер не настроен",
  RATE_LIMITED: "Лимит частоты",
  DUPLICATE: "Дубликат",
  DO_NOT_CONTACT: "В списке «не беспокоить»",
  FAILED: "Ошибка",
};

const OUTREACH_STATUS_BADGE: Record<string, string> = {
  SENT: "bg-green-950 text-green-300",
  DRY_RUN: "bg-neutral-800 text-neutral-400",
  SANDBOX: "bg-neutral-800 text-neutral-400",
  NO_PROVIDER_CONFIGURED: "bg-amber-950 text-amber-300",
  RATE_LIMITED: "bg-amber-950 text-amber-300",
  DUPLICATE: "bg-neutral-800 text-neutral-500",
  DO_NOT_CONTACT: "bg-red-950 text-red-300",
  FAILED: "bg-red-950 text-red-300",
};

// Passenger Contractor dispatcher screen — read-only view onto
// PassengerProspect (PASSENGER_CONTRACTOR's own exclusive write surface,
// explicitly distinct from TripRequest/Passenger — a prospect only becomes a
// real passenger once they message RT directly through Mira, at which point
// bridge.ts's markPassengerProspectConverted records the real TripRequestId;
// this page never writes anything).
export default async function PassengerContractorPage() {
  const [outreach, prospects] = await Promise.all([
    recentPassengerAcquisitionOutreach(50),
    activePassengerProspects(50),
  ]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Passenger Contractor — привлечение пассажиров</h2>
      </div>
      <p className="mb-4 text-xs text-neutral-500">
        Только чтение. Заявка становится реальным пассажиром только когда человек сам пишет Mira — до этого момента
        это лишь PassengerProspect, не TripRequest.
      </p>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-neutral-300">Активные заявки ({prospects.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="pr-3 py-1">Статус</th>
                <th className="pr-3 py-1">Источник</th>
                <th className="pr-3 py-1">Текст</th>
                <th className="pr-3 py-1">Маршрут</th>
                <th className="pr-3 py-1">Контакт</th>
                <th className="pr-3 py-1">Когда</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => (
                <tr key={p.id} className="border-t border-neutral-800 align-top">
                  <td className="pr-3 py-1.5">
                    <span className={`rounded px-2 py-0.5 ${PROSPECT_STATUS_BADGE[p.status] ?? "bg-neutral-800 text-neutral-400"}`}>
                      {PROSPECT_STATUS_LABEL_RU[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-400">{p.sourceType}</td>
                  <td className="pr-3 py-1.5 max-w-md truncate text-neutral-300">{p.sourceText}</td>
                  <td className="pr-3 py-1.5 text-neutral-400">
                    {p.rawRouteText}
                    {p.rawTravelDate && <div className="text-neutral-600">{p.rawTravelDate.toISOString().slice(0, 10)}</div>}
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-400">
                    {p.rawPhone && <div>{p.rawPhone}</div>}
                    {p.rawTelegramUsername && <div>@{p.rawTelegramUsername}</div>}
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-600">{p.createdAt.toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {prospects.length === 0 && <p className="mt-2 text-sm text-neutral-500">Активных заявок нет.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-neutral-300">Журнал рассылки ({outreach.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="pr-3 py-1">Статус</th>
                <th className="pr-3 py-1">Канал</th>
                <th className="pr-3 py-1">Источник</th>
                <th className="pr-3 py-1">Сводка</th>
                <th className="pr-3 py-1">Когда</th>
              </tr>
            </thead>
            <tbody>
              {outreach.map((e) => (
                <tr key={e.id} className="border-t border-neutral-800 align-top">
                  <td className="pr-3 py-1.5">
                    <span className={`rounded px-2 py-0.5 ${OUTREACH_STATUS_BADGE[e.status] ?? "bg-neutral-800 text-neutral-400"}`}>
                      {OUTREACH_STATUS_LABEL_RU[e.status] ?? e.status}
                    </span>
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-400">{e.channel}</td>
                  <td className="pr-3 py-1.5 text-neutral-400">
                    {e.sourceType}
                    {e.sourceRef && <div className="text-neutral-600">{e.sourceRef}</div>}
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-300">{e.messageSummary}</td>
                  <td className="pr-3 py-1.5 text-neutral-600">{e.createdAt.toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {outreach.length === 0 && <p className="mt-2 text-sm text-neutral-500">Рассылок пока нет.</p>}
        </div>
      </section>
    </div>
  );
}
