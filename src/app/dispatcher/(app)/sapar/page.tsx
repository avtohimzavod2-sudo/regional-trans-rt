import Link from "next/link";
import { db } from "@/lib/db";
import type { ShipmentStatus } from "@prisma/client";
import { canTransitionShipment } from "@/lib/sapar/lifecycle";
import { confirmShipmentQuoteAction, rejectShipmentQuoteAction, shipmentTransitionAction } from "../../actions";

export const dynamic = "force-dynamic";

const ALL_STATUSES: ShipmentStatus[] = [
  "DRAFT",
  "NEEDS_INFO",
  "READY_FOR_MATCHING",
  "SEARCHING",
  "QUOTED",
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
  "AWAITING_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "AT_TRANSFER_POINT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
  "DISPUTED",
];

const CLOSED_STATUSES: ShipmentStatus[] = ["DELIVERED", "CANCELLED"];

const RISK_BADGE: Record<string, string> = {
  LOW: "bg-neutral-800 text-neutral-400",
  ELEVATED: "bg-amber-950 text-amber-300",
  BLOCKED: "bg-red-950 text-red-300",
};

export default async function SaparPage() {
  const shipments = await db.shipment.findMany({
    where: { status: { notIn: CLOSED_STATUSES } },
    include: { assignedExecutor: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const buckets = ALL_STATUSES.filter((s) => !CLOSED_STATUSES.includes(s)).map((status) => ({
    status,
    count: shipments.filter((s) => s.status === status).length,
  }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Сапар — доставки в работе ({shipments.length})</h2>
        <nav className="flex gap-3 text-sm text-neutral-400">
          <Link href="/dispatcher/sapar/executors" className="hover:text-neutral-100">
            Исполнители
          </Link>
          <Link href="/dispatcher/sapar/incidents" className="hover:text-neutral-100">
            Инциденты
          </Link>
        </nav>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {buckets
          .filter((b) => b.count > 0)
          .map((b) => (
            <span key={b.status} className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-400">
              {b.status}: {b.count}
            </span>
          ))}
      </div>

      <div className="space-y-2">
        {shipments.map((s) => {
          // CONFIRMED is excluded here on purpose: it may only be reached via
          // the dedicated Confirm button below, which also creates the leg
          // and assigns the executor (AGENTS hardening spec s.3/s.19/s.32 —
          // the Confirmation Gate must never be bypassable from this dropdown).
          const nextStatuses = ALL_STATUSES.filter((to) => to !== "CONFIRMED" && canTransitionShipment(s.status, to));
          const awaitingConfirmation = s.status === "AWAITING_CONFIRMATION";
          return (
            <div key={s.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className="flex items-center justify-between">
                <Link href={`/dispatcher/sapar/${s.id}`} className="font-medium hover:underline">
                  {s.publicId}
                </Link>
                <span className={`rounded px-2 py-0.5 text-xs ${RISK_BADGE[s.riskLevel] ?? RISK_BADGE.LOW}`}>{s.riskLevel}</span>
              </div>
              <div className="mt-1 text-neutral-300">
                {s.pickupText || "?"} → {s.destinationText || "?"} · статус: {s.status}
                {s.cargoDescription && <> · груз: {s.cargoDescription}</>}
                {s.assignedExecutor && <> · исполнитель: {s.assignedExecutor.name}</>}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {s.channel} · {s.senderContact} · {s.createdAt.toLocaleString("ru-RU")}
                {s.riskReason && <> · риск: {s.riskReason}</>}
              </div>
              {awaitingConfirmation && (
                <div className="mt-2 flex items-center gap-2">
                  <form action={confirmShipmentQuoteAction.bind(null, s.id)}>
                    <button type="submit" className="rounded bg-green-900 px-2 py-1 text-xs font-medium text-green-200 hover:bg-green-800">
                      Подтвердить
                    </button>
                  </form>
                  <form action={rejectShipmentQuoteAction.bind(null, s.id)}>
                    <button type="submit" className="rounded bg-red-950 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-900">
                      Отклонить / другой вариант
                    </button>
                  </form>
                </div>
              )}
              {nextStatuses.length > 0 && (
                <form action={shipmentTransitionAction.bind(null, s.id)} className="mt-2 flex items-center gap-2">
                  <select name="status" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs">
                    {nextStatuses.map((to) => (
                      <option key={to} value={to}>
                        {to}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rounded bg-blue-900 px-2 py-1 text-xs font-medium text-blue-200 hover:bg-blue-800">
                    Изменить статус
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {shipments.length === 0 && <p className="text-sm text-neutral-500">Нет активных доставок.</p>}
      </div>
    </div>
  );
}
