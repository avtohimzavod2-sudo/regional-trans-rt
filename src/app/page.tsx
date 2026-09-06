import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 px-6 text-center text-neutral-100">
      <h1 className="text-2xl font-semibold">Regional Trans RT</h1>
      <p className="max-w-xl text-neutral-400">
        Приватная цифровая диспетчерская междугородних пассажирских поездок в Кыргызстане. Пассажиры — через WhatsApp,
        водители — через Telegram. Regional Trans является информационным посредником и не выступает перевозчиком;
        договор перевозки заключается напрямую между пассажиром и водителем.
      </p>
      <Link href="/dispatcher" className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500">
        Диспетчерская панель
      </Link>
    </div>
  );
}
