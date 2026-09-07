import Link from "next/link";
import { db } from "@/lib/db";
import { PAYMENT_STATUS_LABEL_RU, PRELIMINARY_CHECK_LABEL_RU, TREASURY_REVIEW_LABEL_RU } from "@/lib/sapargul/labels";

export const dynamic = "force-dynamic";

const CLOSED_STATUSES = ["REFUND_CONFIRMED", "CANCELLED"] as const;

function nowMs(): number {
  return Date.now();
}

const STATUS_BADGE: Record<string, string> = {
  PAYMENT_REQUIRED: "bg-neutral-800 text-neutral-400",
  PAYMENT_INSTRUCTIONS_READY: "bg-neutral-800 text-neutral-400",
  AWAITING_PAYMENT: "bg-blue-950 text-blue-300",
  PAYMENT_EVIDENCE_RECEIVED: "bg-amber-950 text-amber-300",
  PAYMENT_REVIEW: "bg-amber-950 text-amber-300",
  AWAITING_TREASURER_CONFIRMATION: "bg-amber-950 text-amber-300",
  PAYMENT_CONFIRMED: "bg-green-950 text-green-300",
  PAYMENT_MISMATCH: "bg-red-950 text-red-300",
  PAYMENT_REJECTED: "bg-red-950 text-red-300",
  REFUND_REQUIRED: "bg-purple-950 text-purple-300",
  REFUND_PENDING: "bg-purple-950 text-purple-300",
};

export default async function SapargulFinancePage() {
  const payments = await db.shipmentPayment.findMany({
    where: { status: { notIn: [...CLOSED_STATUSES] } },
    include: { shipment: { select: { publicId: true, senderContact: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const now = nowMs();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Сапаргуль — оплата грузов и посылок ({payments.length})</h2>
        <nav className="flex gap-3 text-sm text-neutral-400">
          <Link href="/dispatcher/finance/treasury" className="hover:text-neutral-100">
            Казначей
          </Link>
        </nav>
      </div>

      <div className="space-y-2">
        {payments.map((p) => {
          const waitingMs = now - p.updatedAt.getTime();
          const waitingHours = Math.floor(waitingMs / (60 * 60 * 1000));
          return (
            <div key={p.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <div className="flex items-center justify-between">
                <Link href={`/dispatcher/finance/sapargul/${p.id}`} className="font-medium hover:underline">
                  {p.orderReference}
                </Link>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[p.status] ?? "bg-neutral-800 text-neutral-400"}`}>{PAYMENT_STATUS_LABEL_RU[p.status]}</span>
              </div>
              <div className="mt-1 text-neutral-300">
                Заявка: {p.shipment.publicId} · Клиент: {p.shipment.senderContact} · К оплате: {p.amountExpectedSom} {p.currency}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Предв. сверка: {PRELIMINARY_CHECK_LABEL_RU[p.preliminaryCheckStatus]} · Казначей: {TREASURY_REVIEW_LABEL_RU[p.treasuryReviewStatus]} · ожидает {waitingHours} ч.
                {p.discrepancyFlags.length > 0 && <> · расхождения: {p.discrepancyFlags.join(", ")}</>}
              </div>
            </div>
          );
        })}
        {payments.length === 0 && <p className="text-sm text-neutral-500">Нет активных платежей.</p>}
      </div>
    </div>
  );
}
