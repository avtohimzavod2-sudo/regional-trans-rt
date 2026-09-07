import Link from "next/link";
import LogoutButton from "../logout-button";

export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Regional Trans RT</span>
          <nav className="flex flex-wrap gap-4 text-sm text-neutral-400">
            <Link href="/dispatcher" className="hover:text-neutral-100">
              Панель
            </Link>
            <Link href="/dispatcher/scout" className="hover:text-neutral-100">
              RT Scout
            </Link>
            <Link href="/dispatcher/drivers" className="hover:text-neutral-100">
              Водители
            </Link>
            <Link href="/dispatcher/ledger" className="hover:text-neutral-100">
              RT Баланс
            </Link>
            <Link href="/dispatcher/parcels" className="hover:text-neutral-100">
              Посылки
            </Link>
            <Link href="/dispatcher/sapar" className="hover:text-neutral-100">
              Сапар
            </Link>
            <Link href="/dispatcher/finance/sapargul" className="hover:text-neutral-100">
              Сапаргуль
            </Link>
            <Link href="/dispatcher/finance/treasury" className="hover:text-neutral-100">
              Казначей
            </Link>
            <Link href="/dispatcher/tyyin" className="hover:text-neutral-100">
              Тыйын
            </Link>
            <Link href="/dispatcher/adilet" className="hover:text-neutral-100">
              Адилет
            </Link>
            <Link href="/dispatcher/support" className="hover:text-neutral-100">
              Обращения
            </Link>
            <Link href="/dispatcher/analytics" className="hover:text-neutral-100">
              Аналитика
            </Link>
            <Link href="/dispatcher/agents" className="hover:text-neutral-100">
              Агенты
            </Link>
            <Link href="/dispatcher/mira" className="hover:text-neutral-100">
              Mira Center
            </Link>
            <Link href="/dispatcher/jolchu" className="hover:text-neutral-100">
              Jolchu Center
            </Link>
            <Link href="/dispatcher/audit" className="hover:text-neutral-100">
              Журнал действий
            </Link>
          </nav>
        </div>
        <LogoutButton />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
