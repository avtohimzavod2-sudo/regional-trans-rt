// Human-readable Russian labels for the dispatcher UI (mirrors
// src/lib/sapargul/labels.ts) — raw enum values must never be shown to a
// human reviewer directly.
import type { AccountantCaseStatus, AccountantCaseType, TreasuryDepartment, TreasuryTransactionStatus } from "@prisma/client";

export const TREASURY_TRANSACTION_STATUS_LABEL_RU: Record<TreasuryTransactionStatus, string> = {
  RECEIVED: "Получена, не сверена",
  MATCHED: "Сверена и подтверждена",
  NEEDS_MANUAL_RECONCILIATION: "Нужна ручная сверка",
};

export const TREASURY_DEPARTMENT_LABEL_RU: Record<TreasuryDepartment, string> = {
  CARGO: "Грузоперевозки",
  PASSENGER: "Пассажирские",
  OTHER: "Прочее",
};

export const ACCOUNTANT_CASE_TYPE_LABEL_RU: Record<AccountantCaseType, string> = {
  REFUND_REQUIRED: "Требуется возврат",
  OVERPAYMENT_RESOLUTION: "Разрешение переплаты",
  COMPENSATION_REVIEW: "Рассмотрение компенсации",
  WRONG_PAYMENT: "Ошибочный платёж",
  DUPLICATE_PAYMENT: "Дублирующийся платёж",
  UNMATCHED_PAYMENT: "Несопоставленный платёж",
  CUSTOMER_DISPUTE: "Спор с клиентом",
  MANUAL_RECONCILIATION: "Ручная сверка",
  OTHER: "Другое",
};

export const ACCOUNTANT_CASE_STATUS_LABEL_RU: Record<AccountantCaseStatus, string> = {
  OPEN: "Открыто",
  IN_PROGRESS: "В работе",
  RESOLVED: "Решено",
  CLOSED: "Закрыто",
};
