// Shared Russian display vocabulary for OperationalState (spec s.5/s.6 need
// the exact same 10-state labels on both the RT OFFICE and Drive CRM
// dispatcher screens) — kept in one place so the two pages can never drift
// into inconsistent wording for the same state.
export const OPERATIONAL_STATE_LABEL_RU: Record<string, string> = {
  AVAILABLE: "Доступен",
  PLANNED: "Запланирован",
  WAITING_DEPARTURE: "Ожидает выезда",
  EN_ROUTE: "В пути",
  DELAYED: "Задержка",
  ARRIVED: "Прибыл",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
  BREAKDOWN: "Поломка",
  OFFLINE: "Не на связи",
};

export const OPERATIONAL_STATE_BADGE: Record<string, string> = {
  AVAILABLE: "bg-neutral-800 text-neutral-300",
  PLANNED: "bg-neutral-800 text-neutral-300",
  WAITING_DEPARTURE: "bg-blue-950 text-blue-300",
  EN_ROUTE: "bg-blue-950 text-blue-300",
  DELAYED: "bg-amber-950 text-amber-300",
  ARRIVED: "bg-green-950 text-green-300",
  COMPLETED: "bg-green-950 text-green-300",
  CANCELLED: "bg-neutral-800 text-neutral-500",
  BREAKDOWN: "bg-red-950 text-red-300",
  OFFLINE: "bg-neutral-800 text-neutral-500",
};

export const OPERATIONAL_STATE_ORDER = [
  "AVAILABLE",
  "PLANNED",
  "WAITING_DEPARTURE",
  "EN_ROUTE",
  "DELAYED",
  "ARRIVED",
  "COMPLETED",
  "CANCELLED",
  "BREAKDOWN",
  "OFFLINE",
] as const;
