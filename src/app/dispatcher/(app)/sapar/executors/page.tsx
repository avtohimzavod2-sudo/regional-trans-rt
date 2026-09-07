import Link from "next/link";
import { db } from "@/lib/db";
import type { DeliveryExecutorStatus } from "@prisma/client";
import { computeReliabilityScore } from "@/lib/sapar/executors";
import { setDeliveryExecutorStatusAction } from "../../../actions";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: DeliveryExecutorStatus[] = ["ACTIVE", "LIMITED", "SUSPENDED", "BLOCKED"];

export default async function SaparExecutorsPage() {
  const executors = await db.deliveryExecutor.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Исполнители доставки ({executors.length})</h2>
        <Link href="/dispatcher/sapar" className="text-sm text-neutral-400 hover:text-neutral-100">
          ← Сапар
        </Link>
      </div>
      <div className="space-y-2">
        {executors.map((e) => {
          const reliability = computeReliabilityScore(e);
          return (
            <div key={e.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{e.name}</span>
                <span className="text-xs text-neutral-500">
                  {e.source} · статус: {e.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                зоны: {e.zones.join(", ") || "—"} · заказов: {e.totalOrders} · надёжность:{" "}
                {reliability !== null ? `${Math.round(reliability * 100)}%` : "недостаточно данных"} ·
                проверка: {e.verificationStatus}
              </div>
              {e.blacklistReason && <div className="mt-1 text-xs text-red-400">причина блокировки: {e.blacklistReason}</div>}
              <form action={setDeliveryExecutorStatusAction.bind(null, e.id)} className="mt-2 flex items-center gap-2">
                <select name="status" defaultValue={e.status} className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs">
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  name="reason"
                  placeholder="причина (для приостановки/блокировки)"
                  className="w-64 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
                />
                <button type="submit" className="rounded bg-blue-900 px-2 py-1 text-xs font-medium text-blue-200 hover:bg-blue-800">
                  Сохранить
                </button>
              </form>
            </div>
          );
        })}
        {executors.length === 0 && <p className="text-sm text-neutral-500">Исполнителей пока нет.</p>}
      </div>
    </div>
  );
}
