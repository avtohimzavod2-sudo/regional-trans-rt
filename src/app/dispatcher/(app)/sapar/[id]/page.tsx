import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isMockProviderCode } from "@/lib/sapar/provider";
import { confirmShipmentQuoteAction, rejectShipmentQuoteAction } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function SaparShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shipment = await db.shipment.findUnique({
    where: { id },
    include: {
      assignedExecutor: true,
      legs: { include: { executor: true }, orderBy: { sequence: "asc" } },
      quotes: { include: { executor: true }, orderBy: { createdAt: "asc" } },
      incidents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!shipment) notFound();

  const timeline = await db.auditLogEntry.findMany({
    where: { entityType: "Shipment", entityId: shipment.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dispatcher/sapar" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Сапар
        </Link>
        <h2 className="mt-1 text-base font-semibold">
          {shipment.publicId} · {shipment.status}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          {shipment.pickupText || "?"} → {shipment.destinationText || "?"}
          {shipment.cargoDescription && <> · груз: {shipment.cargoDescription}</>}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {shipment.channel} · {shipment.senderContact} · создано {shipment.createdAt.toLocaleString("ru-RU")}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          риск: {shipment.riskLevel}
          {shipment.riskFlags.length > 0 && <> ({shipment.riskFlags.join(", ")})</>}
          {shipment.riskReason && <> — {shipment.riskReason}</>}
        </p>
        {shipment.missingFields.length > 0 && (
          <p className="mt-1 text-xs text-amber-400">не хватает: {shipment.missingFields.join(", ")}</p>
        )}
        {shipment.status === "AWAITING_CONFIRMATION" && (
          <div className="mt-3 flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 p-2">
            <span className="text-xs text-neutral-400">Ожидает подтверждения клиента —</span>
            <form action={confirmShipmentQuoteAction.bind(null, shipment.id)}>
              <button type="submit" className="rounded bg-green-900 px-2 py-1 text-xs font-medium text-green-200 hover:bg-green-800">
                Подтвердить
              </button>
            </form>
            <form action={rejectShipmentQuoteAction.bind(null, shipment.id)}>
              <button type="submit" className="rounded bg-red-950 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-900">
                Отклонить / другой вариант
              </button>
            </form>
          </div>
        )}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Котировки ({shipment.quotes.length})</h3>
        <div className="space-y-1">
          {shipment.quotes.map((q) => (
            <div key={q.id} className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300">
              {q.providerCode} · {q.priceSom != null ? `${q.priceSom} сом` : "цена неизвестна"} ({q.priceSource})
              {isMockProviderCode(q.providerCode) && <span className="ml-1 rounded bg-amber-950 px-1 text-amber-300">SANDBOX</span>} ·{" "}
              {q.serviceType} · статус: {q.status}
              {q.executor && (
                <>
                  {" "}
                  · исполнитель: {q.executor.name} ({q.executor.verificationStatus})
                </>
              )}
              {q.rankReasons.length > 0 && <> · {q.rankReasons.join(", ")}</>}
            </div>
          ))}
          {shipment.quotes.length === 0 && <p className="text-xs text-neutral-500">Котировок пока нет.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Этапы доставки ({shipment.legs.length})</h3>
        <div className="space-y-1">
          {shipment.legs.map((leg) => (
            <div key={leg.id} className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300">
              #{leg.sequence} {leg.kind} · {leg.originText} → {leg.destinationText} · статус: {leg.status}
              {leg.executor && <> · исполнитель: {leg.executor.name}</>}
            </div>
          ))}
          {shipment.legs.length === 0 && <p className="text-xs text-neutral-500">Этапов пока нет.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Инциденты ({shipment.incidents.length})</h3>
        <div className="space-y-1">
          {shipment.incidents.map((inc) => (
            <div key={inc.id} className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300">
              {inc.type} · {inc.severity} · статус: {inc.status}
              {inc.description && <> — {inc.description}</>}
              {inc.resolution && <> · решение: {inc.resolution}</>}
            </div>
          ))}
          {shipment.incidents.length === 0 && <p className="text-xs text-neutral-500">Инцидентов нет.</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">История</h3>
        <div className="space-y-1">
          {timeline.map((e) => (
            <div key={e.id} className="text-xs text-neutral-500">
              {e.createdAt.toLocaleString("ru-RU")} · {e.action}
            </div>
          ))}
          {timeline.length === 0 && <p className="text-xs text-neutral-500">Записей нет.</p>}
        </div>
      </section>
    </div>
  );
}
