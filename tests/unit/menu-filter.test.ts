import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  applyMenuFilters,
  buildSearchIndex,
  pairingsFor,
} from "@/lib/menu/filter";
import type { ItemView } from "@/lib/menu/view";

const base: Omit<ItemView, "id" | "categoryId" | "name" | "price"> = {
  description: "",
  ingredients: "",
  weight: null,
  cookTime: null,
  oldPrice: null,
  flags: [],
  spicyLevel: 0,
  images: [],
  pairWith: [],
  allergens: [],
  sort: 0,
  alt: "",
};

const items: ItemView[] = [
  {
    ...base,
    id: "s1",
    categoryId: "starters",
    name: "Тартар из тунца",
    price: 3900,
    allergens: ["fish", "sesame"],
    flags: ["hit"],
    ingredients: "тунец, авокадо",
    alt: "Tuna tartare",
  },
  {
    ...base,
    id: "s2",
    categoryId: "starters",
    name: "Буррата",
    price: 4200,
    allergens: ["milk"],
    flags: ["veg"],
  },
  {
    ...base,
    id: "g1",
    categoryId: "grill",
    name: "Шашлык из баранины",
    price: 6900,
    spicyLevel: 2,
  },
  {
    ...base,
    id: "c1",
    categoryId: "cocktails",
    name: "Негрони",
    price: 3500,
    flags: ["hit"],
    pairWith: ["s2", "zz"],
  },
  {
    ...base,
    id: "d1",
    categoryId: "desserts",
    name: "Чизкейк",
    price: 2500,
    allergens: ["milk", "gluten"],
  },
];
const cats = ["starters", "grill", "cocktails", "desserts"].map((id) => ({
  id,
  icon: "x",
  title: id,
}));
const alls = [
  { id: "fish", icon: "fish", title: "Рыба" },
  { id: "milk", icon: "milk", title: "Молоко" },
];
const flagLabels = {
  hit: "Хит",
  new: "Новинка",
  spicy: "Острое",
  veg: "Вегетарианское",
  gf: "Без глютена",
  share: "Для компании",
};
const index = buildSearchIndex(items, cats, alls, flagLabels);
const none = new Set<string>();

describe("menu filters", () => {
  it("keeps category grouping with no query and default sort", () => {
    const r = applyMenuFilters(items, { query: "", filters: EMPTY_FILTERS, index, soldOut: none });
    expect(r.grouped).toBe(true);
    expect(r.items).toHaveLength(5);
  });

  it("searches with morphology, other languages, allergens and wrong keyboard layout", () => {
    const q = (query: string) =>
      applyMenuFilters(items, { query, filters: EMPTY_FILTERS, index, soldOut: none }).items.map(
        (i) => i.id,
      );
    expect(q("тунцом")).toEqual(["s1"]);
    expect(q("tuna")).toEqual(["s1"]);
    expect(q("рыба")).toEqual(["s1"]);
    expect(q("shashlyk")).toEqual(["g1"]);
    expect(q("ifiksr")).toEqual(["g1"]); // "шашлык" typed on the EN layout
    expect(q("хит").sort()).toEqual(["c1", "s1"]);
  });

  it("requires every selected flag and treats spicyLevel as spicy", () => {
    const r = applyMenuFilters(items, {
      query: "",
      filters: { ...EMPTY_FILTERS, flags: ["spicy"] },
      index,
      soldOut: none,
    });
    expect(r.items.map((i) => i.id)).toEqual(["g1"]);
  });

  it("excludes allergens", () => {
    const r = applyMenuFilters(items, {
      query: "",
      filters: { ...EMPTY_FILTERS, excludeAllergens: ["milk"] },
      index,
      soldOut: none,
    });
    expect(r.items.map((i) => i.id)).toEqual(["s1", "g1", "c1"]);
  });

  it("sorts by price and hits, pushing sold-out items last", () => {
    const sold = new Set(["d1"]);
    const asc = applyMenuFilters(items, {
      query: "",
      filters: { ...EMPTY_FILTERS, sort: "price_asc" },
      index,
      soldOut: sold,
    });
    expect(asc.grouped).toBe(false);
    expect(asc.items.map((i) => i.id)).toEqual(["c1", "s1", "s2", "g1", "d1"]);
    const desc = applyMenuFilters(items, {
      query: "",
      filters: { ...EMPTY_FILTERS, sort: "price_desc" },
      index,
      soldOut: none,
    });
    expect(desc.items[0]!.id).toBe("g1");
    const hits = applyMenuFilters(items, {
      query: "",
      filters: { ...EMPTY_FILTERS, sort: "hits" },
      index,
      soldOut: none,
    });
    expect(hits.items.slice(0, 2).map((i) => i.id)).toEqual(["s1", "c1"]);
  });

  it("counts active filters including non-default sort", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      activeFilterCount({ flags: ["veg"], excludeAllergens: ["milk", "fish"], sort: "hits" }),
    ).toBe(4);
  });
});

describe("pairings", () => {
  it("uses explicit pairWith first, skipping unknown and sold-out ids", () => {
    const p = pairingsFor(items[3]!, items, new Set(), 3);
    expect(p[0]!.id).toBe("s2");
    expect(p).toHaveLength(3);
    expect(p.map((i) => i.id)).not.toContain("c1");
  });

  it("falls back to other categories, one per category, never sold-out", () => {
    const p = pairingsFor(items[0]!, items, new Set(["c1"]), 4);
    expect(p.map((i) => i.id)).not.toContain("c1");
    expect(p.every((i) => i.categoryId !== "starters")).toBe(true);
    expect(new Set(p.map((i) => i.categoryId)).size).toBe(p.length);
  });
});
