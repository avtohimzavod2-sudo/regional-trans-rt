import Link from "next/link";

const TABS: { href: string; label: string }[] = [
  { href: "/dispatcher/mira", label: "Обзор" },
  { href: "/dispatcher/mira/provider", label: "Провайдер" },
  { href: "/dispatcher/mira/conversations", label: "Диалоги" },
  { href: "/dispatcher/mira/languages", label: "Языки" },
  { href: "/dispatcher/mira/training", label: "Обучение (KY)" },
  { href: "/dispatcher/mira/benchmark", label: "Бенчмарк" },
  { href: "/dispatcher/mira/failed-cases", label: "Ошибки" },
  { href: "/dispatcher/mira/reviews", label: "Ревью" },
  { href: "/dispatcher/mira/audio", label: "Аудио" },
  { href: "/dispatcher/mira/certification", label: "Сертификация" },
  { href: "/dispatcher/mira/trace", label: "Трасса агентов" },
];

export default function MiraCenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Mira Center — МИРА, Контактер RT</h1>
        <p className="text-sm text-neutral-500">Единственная публичная персона RT. Обучение, бенчмарк и сертификация Kyrgyz-first цифрового сотрудника.</p>
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
