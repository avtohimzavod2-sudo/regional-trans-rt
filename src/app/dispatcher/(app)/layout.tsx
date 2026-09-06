import Link from "next/link";
import LogoutButton from "../logout-button";

export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Regional Trans RT</span>
          <nav className="flex gap-4 text-sm text-neutral-400">
            <Link href="/dispatcher" className="hover:text-neutral-100">
              Панель
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
