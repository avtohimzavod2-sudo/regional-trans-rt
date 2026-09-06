import { db } from "@/lib/db";
import type { ParcelStatus } from "@prisma/client";
import { canTransitionParcel } from "@/lib/agents/parcel";
import { parcelTransitionAction } from "../../actions";

export const dynamic = "force-dynamic";

const ALL_STATUSES: ParcelStatus[] = ["PENDING", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "CANCELLED", "DISPUTED"];

export default async function ParcelsPage() {
  const parcels = await db.parcel.findMany({
    where: { status: { notIn: ["DELIVERED", "CANCELLED"] } },
    include: { origin: true, destination: true, driver: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold">Посылки в работе ({parcels.length})</h2>
      <div className="space-y-2">
        {parcels.map((p) => {
          const nextStatuses = ALL_STATUSES.filter((s) => canTransitionParcel(p.status, s));
          return (
            <div key={p.id} className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <span>
                {p.origin.nameRu} → {p.destination.nameRu} · статус: {p.status} · отправитель: {p.senderName ?? p.senderContact} ·
                получатель: {p.receiverName ?? p.receiverContact}
                {p.driver && <> · водитель: {p.driver.name ?? p.driver.telegramUserId}</>}
                {p.priceSom != null && <> · {p.priceSom} сом</>}
              </span>
              {nextStatuses.length > 0 && (
                <form action={parcelTransitionAction.bind(null, p.id)} className="flex items-center gap-2">
                  <select name="status" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs">
                    {nextStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
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
        {parcels.length === 0 && <p className="text-sm text-neutral-500">Нет активных посылок.</p>}
      </div>
    </div>
  );
}
