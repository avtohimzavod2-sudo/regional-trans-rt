import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface Candidate {
  label: string;
  latitude: number;
  longitude: number;
  confidence: number;
}

function asCandidates(json: Prisma.JsonValue): Candidate[] {
  if (!Array.isArray(json)) return [];
  return json as unknown as Candidate[];
}

export default async function JolchuAmbiguitiesPage() {
  const ambiguities = await db.jolchuLocationAmbiguity.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Неоднозначные локации ({ambiguities.length})</h2>
        <p className="text-sm text-neutral-500">
          Жолчу никогда не выбирает случайную точку при неоднозначности — здесь список случаев, требующих уточнения у
          пользователя, с вариантами-кандидатами.
        </p>
      </div>
      <div className="space-y-3">
        {ambiguities.length === 0 && <p className="text-sm text-neutral-500">Неоднозначностей ещё не было.</p>}
        {ambiguities.map((a) => (
          <div key={a.id} className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-medium">{a.rawInput}</div>
              <span className={`rounded px-2 py-0.5 text-xs ${a.status === "OPEN" ? "bg-amber-900 text-amber-300" : "bg-neutral-800 text-neutral-400"}`}>
                {a.status}
              </span>
            </div>
            <div className="text-xs text-neutral-500">{a.createdAt.toISOString().slice(0, 19).replace("T", " ")}</div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
              {asCandidates(a.candidates).map((c, i) => (
                <div key={i} className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs">
                  <div>{c.label}</div>
                  <div className="text-neutral-500">
                    {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)} · увер. {c.confidence.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
