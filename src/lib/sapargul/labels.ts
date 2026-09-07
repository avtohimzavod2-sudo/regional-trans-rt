// Human-readable Russian labels for the dispatcher/treasurer UI (AGENTS
// Sapargul spec s.33) — raw enum values must never be shown to a human
// reviewer directly.
import type { PaymentPreliminaryCheckStatus, PaymentTreasuryReviewStatus, ShipmentPaymentStatus } from "@prisma/client";
import type { DiscrepancyFlag } from "./types";

export const PAYMENT_STATUS_LABEL_RU: Record<ShipmentPaymentStatus, string> = {
  PAYMENT_REQUIRED: "Требуется оплата",
  PAYMENT_INSTRUCTIONS_READY: "Реквизиты готовятся",
  AWAITING_PAYMENT: "Ожидает оплаты клиентом",
  PAYMENT_EVIDENCE_RECEIVED: "Квитанция получена",
  PAYMENT_REVIEW: "Сверяем поступление",
  AWAITING_TREASURER_CONFIRMATION: "Ожидает подтверждения казначея",
  PAYMENT_CONFIRMED: "Оплата подтверждена",
  PAYMENT_MISMATCH: "Расхождение суммы",
  PAYMENT_REJECTED: "Оплата отклонена",
  REFUND_REQUIRED: "Требуется возврат",
  REFUND_PENDING: "Возврат в процессе",
  REFUND_CONFIRMED: "Возврат выполнен",
  CANCELLED: "Отменено",
};

export const PRELIMINARY_CHECK_LABEL_RU: Record<PaymentPreliminaryCheckStatus, string> = {
  PENDING: "Не проверено",
  LIKELY_MATCH: "Похоже на совпадение",
  MISMATCH: "Не совпадает",
  NEEDS_REVIEW: "Нужна проверка",
};

export const TREASURY_REVIEW_LABEL_RU: Record<PaymentTreasuryReviewStatus, string> = {
  PENDING: "Не рассмотрено казначеем",
  CONFIRMED: "Подтверждено казначеем",
  REJECTED: "Отклонено казначеем",
};

export const DISCREPANCY_FLAG_LABEL_RU: Record<DiscrepancyFlag, string> = {
  DUPLICATE_REFERENCE: "Дублирующийся номер транзакции",
  AMOUNT_MISMATCH: "Сумма не совпадает",
  RECIPIENT_MISMATCH: "Получатель не совпадает",
  ORDER_REFERENCE_MISMATCH: "Номер заказа не совпадает",
  STALE_EVIDENCE: "Квитанция устарела",
  UNREADABLE_EVIDENCE: "Сумма не распознана",
  ALREADY_USED_TRANSACTION: "Транзакция уже использована",
  UNKNOWN_PAYMENT_DESTINATION: "Неизвестные реквизиты",
  UNDERPAID: "Недоплата",
  OVERPAID: "Переплата",
  CURRENCY_MISMATCH: "Валюта не совпадает",
};
