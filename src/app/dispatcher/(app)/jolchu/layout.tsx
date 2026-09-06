import Link from "next/link";

const TABS: { href: string; label: string }[] = [
  { href: "/dispatcher/jolchu", label: "Обзор" },
  { href: "/dispatcher/jolchu/requests", label: "Запросы" },
  { href: "/dispatcher/jolchu/locations", label: "Локации" },
  { href: "/dispatcher/jolchu/routes", label: "Маршруты" },
  { href: "/dispatcher/jolchu/providers", label: "Провайдеры" },
  { href: "/dispatcher/jolchu/traffic", label: "Трафик" },
  { href: "/dispatcher/jolchu/last-mile", label: "Last Mile" },
  { href: "/dispatcher/jolchu/ambiguities", label: "Неоднозначности" },
  { href: "/dispatcher/jolchu/errors", label: "Ошибки" },
  { href: "/dispatcher/jolchu/benchmarks", label: "Бенчмарк" },
  { href: "/dispatcher/jolchu/data-freshness", label: "Актуальность данных" },
  { href: "/dispatcher/jolchu/settings", label: "Настройки" },
];

export default function JolchuCenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Jolchu Center — Жолчу, Route Intelligence Agent</h1>
        <p className="text-sm text-neutral-500">
          Внутренний агент RT AI Workforce: превращает человеческое описание места в проверенные структурированные
          данные о маршруте (локация, реальное дорожное расстояние, ETA, трафик, Last Mile). Никогда не выдумывает
          географию и никогда не считает цену.
        </p>
      </div>
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-neutral-800 pb-2 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded px-3 py-1.5 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
