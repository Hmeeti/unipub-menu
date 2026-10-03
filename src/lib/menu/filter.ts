import type { ItemFlag } from "@/lib/domain/types";
import { matchQuery, prepareHaystack } from "@/lib/search/search";
import type { AllergenView, CategoryView, ItemView } from "./view";

export const SORT_MODES = ["default", "price_asc", "price_desc", "hits"] as const;
export type SortMode = (typeof SORT_MODES)[number];

export type MenuFilters = { flags: ItemFlag[]; excludeAllergens: string[]; sort: SortMode };

export const EMPTY_FILTERS: MenuFilters = { flags: [], excludeAllergens: [], sort: "default" };

export function activeFilterCount(f: MenuFilters): number {
  return f.flags.length + f.excludeAllergens.length + (f.sort === "default" ? 0 : 1);
}

type Prepared = ReturnType<typeof prepareHaystack>;
export type SearchIndex = Map<string, Prepared>;

export function buildSearchIndex(
  items: ItemView[],
  categories: CategoryView[],
  allergens: AllergenView[],
  flagLabels: Record<ItemFlag, string>,
): SearchIndex {
  const cat = new Map(categories.map((c) => [c.id, c.title]));
  const alg = new Map(allergens.map((a) => [a.id, a.title]));
  const index: SearchIndex = new Map();
  for (const it of items) {
    index.set(
      it.id,
      prepareHaystack([
        it.name,
        it.description,
        it.ingredients,
        it.alt,
        cat.get(it.categoryId),
        ...it.allergens.map((a) => alg.get(a)),
        ...it.flags.map((f) => flagLabels[f]),
      ]),
    );
  }
  return index;
}

export function hasFlag(item: Pick<ItemView, "flags" | "spicyLevel">, flag: ItemFlag): boolean {
  if (flag === "spicy") return item.flags.includes("spicy") || item.spicyLevel > 0;
  return item.flags.includes(flag);
}

export type FilterResult = {
  items: ItemView[];
  /** grouped by category (default order, no query) or a flat ranked list */
  grouped: boolean;
};

export function applyMenuFilters(
  items: ItemView[],
  opts: { query: string; filters: MenuFilters; index: SearchIndex; soldOut: ReadonlySet<string> },
): FilterResult {
  const { query, filters, index, soldOut } = opts;
  const q = query.trim();
  const scores = new Map<string, number>();
  const order = new Map(items.map((it, i) => [it.id, i]));

  const matched = items.filter((it) => {
    if (filters.flags.some((f) => !hasFlag(it, f))) return false;
    if (filters.excludeAllergens.some((a) => it.allergens.includes(a))) return false;
    if (q) {
      const prepared = index.get(it.id);
      if (!prepared) return false;
      const m = matchQuery(q, prepared);
      if (!m.ok) return false;
      scores.set(it.id, m.score);
    }
    return true;
  });

  const grouped = !q && filters.sort === "default";
  if (grouped) return { items: matched, grouped };

  const byDefault = (a: ItemView, b: ItemView) => order.get(a.id)! - order.get(b.id)!;
  const byScore = (a: ItemView, b: ItemView) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
  const compare: Record<SortMode, (a: ItemView, b: ItemView) => number> = {
    default: (a, b) => byScore(a, b) || byDefault(a, b),
    price_asc: (a, b) => a.price - b.price || byDefault(a, b),
    price_desc: (a, b) => b.price - a.price || byDefault(a, b),
    hits: (a, b) =>
      Number(hasFlag(b, "hit")) - Number(hasFlag(a, "hit")) || byScore(a, b) || byDefault(a, b),
  };
  const sorted = [...matched].sort(
    (a, b) => Number(soldOut.has(a.id)) - Number(soldOut.has(b.id)) || compare[filters.sort](a, b),
  );
  return { items: sorted, grouped };
}

/** "Goes well with": explicit pairWith first, then hits from other categories (one per category). */
export function pairingsFor(
  item: ItemView,
  items: ItemView[],
  soldOut: ReadonlySet<string>,
  limit = 4,
): ItemView[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const result: ItemView[] = [];
  for (const id of item.pairWith) {
    const p = byId.get(id);
    if (p && p.id !== item.id && !soldOut.has(p.id) && !result.includes(p)) result.push(p);
  }
  if (result.length >= limit) return result.slice(0, limit);

  const rank = (i: ItemView) => hash(`${item.id}:${i.id}`);
  const auto = items
    .filter(
      (i) =>
        !result.includes(i) &&
        i.id !== item.id &&
        i.categoryId !== item.categoryId &&
        !soldOut.has(i.id),
    )
    .sort((a, b) => Number(hasFlag(b, "hit")) - Number(hasFlag(a, "hit")) || rank(a) - rank(b));
  const usedCats = new Set<string>();
  for (const i of auto) {
    if (result.length >= limit) break;
    if (usedCats.has(i.categoryId)) continue;
    usedCats.add(i.categoryId);
    result.push(i);
  }
  for (const i of auto) {
    if (result.length >= limit) break;
    if (!result.includes(i)) result.push(i);
  }
  return result;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
