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

// Shared Russian vocabulary for the Fleet Attention Feed's severity levels
// (DRIVER OPERATIONS CENTER pass) — same one-place-only rule as the
// operational-state maps above, reused by both the RT OFFICE and Drive CRM
// "ТРЕБУЕТ ВНИМАНИЯ" blocks.
export const ATTENTION_SEVERITY_LABEL_RU: Record<string, string> = {
  CRITICAL: "Критично",
  HIGH: "Важно",
  WARNING: "Предупреждение",
  INFO: "Информация",
};

export const ATTENTION_SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: "bg-red-950 text-red-300",
  HIGH: "bg-amber-950 text-amber-300",
  WARNING: "bg-amber-950 text-amber-200",
  INFO: "bg-neutral-800 text-neutral-300",
};

// Shared Russian vocabulary for CRM Auto's DriveCrmEvent.eventType — used by
// both the Drive CRM journal table and the Driver Detail operational-history
// timeline so the two never drift into different wording for the same event
// type.
export const EVENT_TYPE_LABEL_RU: Record<string, string> = {
  OPERATIONAL_ETA: "ETA",
  BREAKDOWN_INCIDENT: "Поломка",
  BACKHAUL_OPPORTUNITY: "Обратный рейс",
  OPERATIONAL_HISTORY: "История",
  CORRECTION: "Исправление",
};

export const EVENT_TYPE_BADGE: Record<string, string> = {
  OPERATIONAL_ETA: "bg-blue-950 text-blue-300",
  BREAKDOWN_INCIDENT: "bg-red-950 text-red-300",
  BACKHAUL_OPPORTUNITY: "bg-neutral-800 text-neutral-300",
  OPERATIONAL_HISTORY: "bg-neutral-800 text-neutral-400",
  CORRECTION: "bg-amber-950 text-amber-300",
};
