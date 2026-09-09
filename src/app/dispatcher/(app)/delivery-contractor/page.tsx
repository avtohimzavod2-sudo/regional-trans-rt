import { recentBusinessAcquisitionOutreach, businessProspectPipeline } from "@/lib/delivery-contractor/bridge";

export const dynamic = "force-dynamic";

const PROSPECT_STATUS_LABEL_RU: Record<string, string> = {
  PROSPECT: "Кандидат",
  CONTACTED: "Связались",
  QUALIFIED: "Квалифицирован",
  PARTNERED: "Партнёр",
  DECLINED: "Отказ",
  CHURNED: "Ушёл",
};

const PROSPECT_STATUS_BADGE: Record<string, string> = {
  PROSPECT: "bg-neutral-800 text-neutral-300",
  CONTACTED: "bg-blue-950 text-blue-300",
  QUALIFIED: "bg-blue-950 text-blue-300",
  PARTNERED: "bg-green-950 text-green-300",
  DECLINED: "bg-neutral-800 text-neutral-500",
  CHURNED: "bg-neutral-800 text-neutral-500",
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

// Delivery Contractor / Delivery CRM dispatcher screen — read-only view onto
// BusinessProspect (DELIVERY_CONTRACTOR's exclusive write surface). This is
// explicitly the business-RELATIONSHIP pipeline (prospect -> qualified ->
// partnered), distinct from RT Network's Partner directory and from Sapar's
// individual Shipment execution: once a prospect reaches PARTNERED and a
// HANDOFF_TO_OPERATIONS event is appended, real shipments flow through
// Sapar's own model, not through this log.
export default async function DeliveryContractorPage() {
  const [outreach, prospects] = await Promise.all([recentBusinessAcquisitionOutreach(50), businessProspectPipeline(100)]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Delivery Contractor — Delivery CRM (бизнес-партнёрства)</h2>
      </div>
      <p className="mb-4 text-xs text-neutral-500">
        Только чтение. Отдельно от справочника «Партнёры» (RT Network) и от «Посылок» (операционное исполнение
        Sapar) — здесь только воронка отношений с бизнесом: кандидат → квалифицирован → партнёр.
      </p>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-neutral-300">Воронка бизнес-кандидатов ({prospects.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="pr-3 py-1">Статус</th>
                <th className="pr-3 py-1">Категория</th>
                <th className="pr-3 py-1">Название / текст</th>
                <th className="pr-3 py-1">Контакт</th>
                <th className="pr-3 py-1">Партнёр (RT Network)</th>
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
                  <td className="pr-3 py-1.5 text-neutral-400">{p.category}</td>
                  <td className="pr-3 py-1.5 max-w-md text-neutral-300">
                    {p.businessName && <div className="font-medium text-neutral-200">{p.businessName}</div>}
                    <div className="truncate text-neutral-500">{p.sourceText}</div>
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-400">
                    {p.contactPhone && <div>{p.contactPhone}</div>}
                    {p.contactHandle && <div>@{p.contactHandle}</div>}
                  </td>
                  <td className="pr-3 py-1.5 text-neutral-600">{p.linkedPartnerId ?? "—"}</td>
                  <td className="pr-3 py-1.5 text-neutral-600">{p.createdAt.toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {prospects.length === 0 && <p className="mt-2 text-sm text-neutral-500">Кандидатов пока нет.</p>}
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
