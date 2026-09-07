import Link from "next/link";
import { db } from "@/lib/db";
import { resolveShipmentIncidentAction } from "../../../actions";

export const dynamic = "force-dynamic";

const SEVERITY_BADGE: Record<string, string> = {
  LOW: "bg-neutral-800 text-neutral-400",
  MEDIUM: "bg-amber-950 text-amber-300",
  HIGH: "bg-orange-950 text-orange-300",
  CRITICAL: "bg-red-950 text-red-300",
};

export default async function SaparIncidentsPage() {
  const incidents = await db.shipmentIncident.findMany({
    where: { status: { in: ["OPEN", "ESCALATED", "IN_PROGRESS"] } },
    include: { shipment: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Инциденты Сапар, требующие внимания ({incidents.length})</h2>
        <Link href="/dispatcher/sapar" className="text-sm text-neutral-400 hover:text-neutral-100">
          ← Сапар
        </Link>
      </div>
      <div className="space-y-2">
        {incidents.map((inc) => (
          <div key={inc.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
            <div className="flex items-center justify-between">
              <Link href={`/dispatcher/sapar/${inc.shipmentId}`} className="font-medium hover:underline">
                {inc.shipment.publicId}
              </Link>
              <span className={`rounded px-2 py-0.5 text-xs ${SEVERITY_BADGE[inc.severity] ?? SEVERITY_BADGE.LOW}`}>{inc.severity}</span>
            </div>
            <div className="mt-1 text-neutral-300">
              {inc.type} · статус: {inc.status}
              {inc.description && <> — {inc.description}</>}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {inc.shipment.pickupText || "?"} → {inc.shipment.destinationText || "?"} · открыт {inc.createdAt.toLocaleString("ru-RU")}
            </div>
            <form action={resolveShipmentIncidentAction.bind(null, inc.id)} className="mt-2 flex items-center gap-2">
              <input
                name="resolution"
                required
                placeholder="решение / комментарий"
                className="w-80 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
              />
              <button type="submit" className="rounded bg-blue-900 px-2 py-1 text-xs font-medium text-blue-200 hover:bg-blue-800">
                Закрыть инцидент
              </button>
            </form>
          </div>
        ))}
        {incidents.length === 0 && <p className="text-sm text-neutral-500">Открытых инцидентов нет.</p>}
      </div>
    </div>
  );
}
