import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MiraConversationsPage() {
  const conversations = await db.miraConversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Диалоги ({conversations.length})</h2>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-900 text-neutral-500">
            <tr>
              <th className="px-3 py-2">Канал</th>
              <th className="px-3 py-2">Пользователь</th>
              <th className="px-3 py-2">Роль</th>
              <th className="px-3 py-2">Язык</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">Недостающие поля</th>
              <th className="px-3 py-2">Последнее сообщение</th>
              <th className="px-3 py-2">Обновлён</th>
            </tr>
          </thead>
          <tbody>
            {conversations.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-neutral-500" colSpan={8}>
                  Диалогов ещё не было.
                </td>
              </tr>
            )}
            {conversations.map((c) => (
              <tr key={c.id} className="border-t border-neutral-800 align-top">
                <td className="px-3 py-2">{c.channel}</td>
                <td className="px-3 py-2 text-neutral-400">{c.externalUserId}</td>
                <td className="px-3 py-2">{c.role}</td>
                <td className="px-3 py-2">{c.detectedLanguage ?? "—"}</td>
                <td className="px-3 py-2">{c.status}</td>
                <td className="px-3 py-2 text-neutral-500">
                  {c.missingFields.length > 0 ? c.missingFields.join(", ") : "—"}
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-neutral-400">
                  {c.messages[0]?.rawText ?? c.messages[0]?.transcript ?? "—"}
                </td>
                <td className="px-3 py-2 text-neutral-500">{c.updatedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
