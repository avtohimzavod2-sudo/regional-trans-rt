import { db } from "@/lib/db";
import { CURRICULUM } from "@/lib/mira/training/levels";

export const dynamic = "force-dynamic";

export default async function MiraTrainingPage() {
  const byLevel = await db.miraTrainingExample.groupBy({ by: ["level"], _count: true });
  const countByLevel = new Map(byLevel.map((g) => [g.level, g._count]));
  const totalExamples = byLevel.reduce((sum, g) => sum + g._count, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">MIRA KYRGYZ TRAINING — программа из {CURRICULUM.length} уровней</h2>
        <p className="text-sm text-neutral-500">{totalExamples} примеров в корпусе (все — с провенансом, PII-безопасные).</p>
      </div>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-900 text-neutral-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Код</th>
              <th className="px-3 py-2">Название</th>
              <th className="px-3 py-2">Примеров в корпусе</th>
            </tr>
          </thead>
          <tbody>
            {CURRICULUM.map((lvl) => (
              <tr key={lvl.level} className="border-t border-neutral-800 align-top">
                <td className="px-3 py-2 text-neutral-500">{lvl.level}</td>
                <td className="px-3 py-2 text-neutral-400">{lvl.code}</td>
                <td className="px-3 py-2">
                  <div>{lvl.title}</div>
                  <div className="text-neutral-500">{lvl.goal}</div>
                </td>
                <td className="px-3 py-2">{countByLevel.get(lvl.level) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
