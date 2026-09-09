// BusinessProspect is DELIVERY_CONTRACTOR's exclusive write surface — the
// Delivery CRM's pipeline identity, explicitly distinct from Partner (RT
// Core's onboarded-partner model) and Shipment (Sapar's operational model).
// A BusinessProspect only ever becomes a real Partner through an out-of-band
// onboarding step; linkedPartnerId here is a pointer recorded after the
// fact, never a write into Partner itself.
import type { BusinessCategory, BusinessProspect, BusinessProspectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhone, normalizeTelegramUsername } from "@/lib/agents/scout";
import type { BusinessSightingInput } from "./types";

/** Deterministic keyword mapping — the shared NLU only ever returns a free-text
 * guess (businessCategoryGuess), never the enum itself, so category
 * membership stays a fixed, auditable rule rather than an LLM free choice
 * (spec s.4: deterministic rules first). */
const CATEGORY_KEYWORDS: Array<[BusinessCategory, string[]]> = [
  ["GROCERY", ["продукт", "азык", "грузия", "grocery", "азык-түлүк"]],
  ["HOUSEHOLD_GOODS", ["хознабор", "хозтовар", "чарба", "household"]],
  ["CLOTHING", ["кийим", "одежд", "clothing", "кийим-кече"]],
  ["ELECTRONICS", ["электроник", "техника", "electronics", "гаджет"]],
  ["AUTO_GOODS", ["автозапчаст", "авто товар", "auto parts", "унаа бөлүктөр"]],
  ["BUILDING_MATERIALS", ["стройматериал", "курулуш материал", "building material"]],
  ["FURNITURE", ["мебель", "эмерек", "furniture"]],
  ["FLOWERS", ["цвет", "гүл", "flower"]],
  ["PHARMACY", ["аптека", "дары-дармек", "pharmacy"]],
  ["MARKET_SELLER", ["базар", "рынок", "market"]],
  ["SOCIAL_COMMERCE", ["instagram", "инстаграм", "whatsapp дүкөн", "social commerce"]],
  ["ONLINE_STORE", ["интернет-магазин", "online store", "онлайн дүкөн"]],
  ["WHOLESALE", ["опт", "көтөрмө", "wholesale"]],
  ["RETAIL", ["розниц", "чекене", "retail"]],
];

/** Pure: maps the NLU's free-text business-category guess to a fixed
 * BusinessCategory. Never invents a category the text doesn't support —
 * falls back to OTHER rather than guessing among the specific ones. */
export function guessBusinessCategory(businessCategoryGuess: string | null): BusinessCategory {
  if (!businessCategoryGuess) return "OTHER";
  const lowered = businessCategoryGuess.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lowered.includes(k))) return category;
  }
  return "OTHER";
}

const BUSINESS_PROSPECT_TRANSITIONS: Record<BusinessProspectStatus, BusinessProspectStatus[]> = {
  PROSPECT: ["CONTACTED", "DECLINED"],
  CONTACTED: ["QUALIFIED", "DECLINED"],
  QUALIFIED: ["PARTNERED", "DECLINED"],
  PARTNERED: ["CHURNED"],
  DECLINED: [],
  CHURNED: [],
};

/** Pure: is this a legal BusinessProspect lifecycle transition? Critical
 * transitions stay deterministic code, never a free-form LLM decision
 * (spec s.8), same discipline as crm-auto/lifecycle.ts's breakdown rules. */
export function canTransitionBusinessProspect(current: BusinessProspectStatus, next: BusinessProspectStatus): boolean {
  return BUSINESS_PROSPECT_TRANSITIONS[current].includes(next);
}

export async function findExistingBusinessProspect(input: BusinessSightingInput): Promise<BusinessProspect | null> {
  const normalizedPhone = normalizePhone(input.contactPhone);
  if (normalizedPhone) {
    const byPhone = await db.businessProspect.findFirst({ where: { contactPhone: normalizedPhone }, orderBy: { createdAt: "desc" } });
    if (byPhone) return byPhone;
  }

  const handle = normalizeTelegramUsername(input.contactHandle);
  if (handle) {
    const byHandle = await db.businessProspect.findFirst({
      where: { contactHandle: { equals: handle, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    if (byHandle) return byHandle;
  }

  return null;
}

export async function createBusinessProspect(input: BusinessSightingInput, category: BusinessCategory): Promise<BusinessProspect> {
  return db.businessProspect.create({
    data: {
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      sourceText: input.sourceText,
      businessName: input.businessName,
      category,
      contactPhone: normalizePhone(input.contactPhone),
      contactHandle: normalizeTelegramUsername(input.contactHandle),
      status: "PROSPECT",
    },
  });
}

/** Rejects an illegal lifecycle jump rather than forcing it — the caller
 * (orchestrator.ts) always checks this before writing, mirroring CRM Auto's
 * canOpenBreakdown/canResolveBreakdown pattern. */
export async function transitionBusinessProspectStatus(prospectId: string, next: BusinessProspectStatus): Promise<BusinessProspect> {
  return db.businessProspect.update({ where: { id: prospectId }, data: { status: next } });
}

export async function linkBusinessProspectToPartner(prospectId: string, partnerId: string): Promise<BusinessProspect> {
  return db.businessProspect.update({ where: { id: prospectId }, data: { linkedPartnerId: partnerId } });
}
