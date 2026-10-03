import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  allergens,
  categories,
  itemAllergens,
  items,
  promotions,
  rooms,
  tables,
  venue,
  waiters,
} from "@/lib/db/schema";
import type { I18nText, ItemFlag, MenuSnapshot, VenueFeatures } from "@/lib/domain/types";
import { buildSnapshot, getPublished } from "@/lib/menu/repository";
import { AdminError } from "./errors";
import type {
  CategoryInput,
  ItemInput,
  PromotionInput,
  RoomInput,
  TableInput,
  VenueInput,
  WaiterInput,
} from "./schemas";

/** Drops empty translations so the guest fallback (→ ru) kicks in instead of a blank string. */
export function cleanText(t: { ru: string; kk?: string; en?: string }): I18nText {
  const out: I18nText = { ru: t.ru };
  if (t.kk) out.kk = t.kk;
  if (t.en) out.en = t.en;
  return out;
}

const cleanOptional = (t: { ru: string; kk?: string; en?: string } | null) =>
  t && (t.ru || t.kk || t.en) ? cleanText(t) : null;

// ── Items ────────────────────────────────────────────────────────────────────

export type AdminItem = typeof items.$inferSelect & { allergens: string[] };

export async function listItems(db: Db): Promise<AdminItem[]> {
  const rows = await db.select().from(items).orderBy(asc(items.sort), asc(items.id));
  const links = await db.select().from(itemAllergens);
  const byItem = new Map<string, string[]>();
  for (const l of links) byItem.set(l.itemId, [...(byItem.get(l.itemId) ?? []), l.allergenId]);
  return rows.map((r) => ({ ...r, allergens: (byItem.get(r.id) ?? []).sort() }));
}

export async function getItem(db: Db, id: string): Promise<AdminItem | null> {
  const [row] = await db.select().from(items).where(eq(items.id, id));
  if (!row) return null;
  const links = await db
    .select({ a: itemAllergens.allergenId })
    .from(itemAllergens)
    .where(eq(itemAllergens.itemId, id));
  return { ...row, allergens: links.map((l) => l.a).sort() };
}

export async function saveItem(db: Db, input: ItemInput, isNew: boolean) {
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input.categoryId));
  if (!cat) throw new AdminError("Категория не найдена");
  const pairWith = [...new Set(input.pairWith.filter((p) => p !== input.id))];
  if (pairWith.length) {
    const found = await db.select({ id: items.id }).from(items).where(inArray(items.id, pairWith));
    if (found.length !== pairWith.length)
      throw new AdminError("В рекомендациях есть несуществующее блюдо");
  }
  const allergenIds = [...new Set(input.allergens)];
  if (allergenIds.length) {
    const found = await db
      .select({ id: allergens.id })
      .from(allergens)
      .where(inArray(allergens.id, allergenIds));
    if (found.length !== allergenIds.length) throw new AdminError("Неизвестный аллерген");
  }
  const existing = await getItem(db, input.id);
  if (isNew && existing) throw new AdminError(`Блюдо с кодом «${input.id}» уже есть`);
  if (!isNew && !existing) throw new AdminError("Блюдо не найдено");

  const values = {
    categoryId: input.categoryId,
    name: cleanText(input.name),
    description: cleanText(input.description),
    ingredients: cleanText(input.ingredients),
    price: input.price,
    salePrice: input.salePrice,
    saleSchedule: input.salePrice === null ? null : input.saleSchedule,
    flags: input.flags as ItemFlag[],
    spicyLevel: input.spicyLevel,
    weight: cleanOptional(input.weight),
    cookTime: cleanOptional(input.cookTime),
    images: input.images,
    pairWith,
    isActive: input.isActive,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    if (isNew) {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${items.sort})` })
        .from(items)
        .where(eq(items.categoryId, input.categoryId));
      await tx.insert(items).values({ id: input.id, ...values, sort: Number(last?.max ?? 0) + 10 });
    } else {
      await tx.update(items).set(values).where(eq(items.id, input.id));
    }
    await tx.delete(itemAllergens).where(eq(itemAllergens.itemId, input.id));
    if (allergenIds.length)
      await tx
        .insert(itemAllergens)
        .values(allergenIds.map((a) => ({ itemId: input.id, allergenId: a })));
  });
  return { before: existing };
}

export async function deleteItem(db: Db, id: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(items)
      .set({ pairWith: sql`array_remove(${items.pairWith}, ${id})` })
      .where(sql`${id} = any(${items.pairWith})`);
    await tx.delete(items).where(eq(items.id, id));
  });
}

export async function bulkItems(
  db: Db,
  ids: string[],
  action: "sold_out" | "in_stock" | "hide" | "show" | "move",
  categoryId?: string,
) {
  const now = new Date();
  const set =
    action === "sold_out"
      ? { soldOut: true }
      : action === "in_stock"
        ? { soldOut: false }
        : action === "hide"
          ? { isActive: false }
          : action === "show"
            ? { isActive: true }
            : null;
  if (set) {
    const res = await db
      .update(items)
      .set({ ...set, updatedAt: now })
      .where(inArray(items.id, ids))
      .returning({ id: items.id });
    return res.length;
  }
  if (!categoryId) throw new AdminError("Выберите категорию");
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId));
  if (!cat) throw new AdminError("Категория не найдена");
  const res = await db
    .update(items)
    .set({ categoryId, updatedAt: now })
    .where(inArray(items.id, ids))
    .returning({ id: items.id });
  return res.length;
}

/** Sort keys in steps of 10 in the given order (drag-and-drop result for one category). */
export async function reorder(db: Db, kind: "items" | "categories", ids: string[]) {
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      if (kind === "items")
        await tx
          .update(items)
          .set({ sort: (i + 1) * 10 })
          .where(eq(items.id, id));
      else
        await tx
          .update(categories)
          .set({ sort: (i + 1) * 10 })
          .where(eq(categories.id, id));
    }
  });
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(db: Db) {
  const rows = await db.select().from(categories).orderBy(asc(categories.sort), asc(categories.id));
  const counts = await db
    .select({ id: items.categoryId, n: count() })
    .from(items)
    .groupBy(items.categoryId);
  const byId = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return rows.map((r) => ({ ...r, itemCount: byId.get(r.id) ?? 0 }));
}

export async function saveCategory(db: Db, input: CategoryInput, isNew: boolean) {
  const [existing] = await db.select().from(categories).where(eq(categories.id, input.id));
  if (isNew && existing) throw new AdminError(`Категория «${input.id}» уже есть`);
  if (!isNew && !existing) throw new AdminError("Категория не найдена");
  const values = {
    icon: input.icon,
    title: cleanText(input.title),
    isActive: input.isActive,
    updatedAt: new Date(),
  };
  if (isNew) {
    const [last] = await db
      .select({ max: sql<number | null>`max(${categories.sort})` })
      .from(categories);
    await db
      .insert(categories)
      .values({ id: input.id, ...values, sort: Number(last?.max ?? 0) + 10 });
  } else {
    await db.update(categories).set(values).where(eq(categories.id, input.id));
  }
}

export async function deleteCategory(db: Db, id: string) {
  const [used] = await db.select({ n: count() }).from(items).where(eq(items.categoryId, id));
  if (Number(used?.n) > 0)
    throw new AdminError("В категории есть блюда — перенесите или удалите их");
  await db.delete(categories).where(eq(categories.id, id));
}

// ── Promotions ───────────────────────────────────────────────────────────────

export async function listPromotions(db: Db) {
  return db.select().from(promotions).orderBy(asc(promotions.sort), asc(promotions.id));
}

export async function savePromotion(db: Db, input: PromotionInput) {
  if (input.itemId) {
    const [it] = await db.select({ id: items.id }).from(items).where(eq(items.id, input.itemId));
    if (!it) throw new AdminError("Блюдо для акции не найдено");
  }
  if (input.kind === "dish_of_day" && !input.itemId)
    throw new AdminError("Для «Блюда дня» выберите блюдо");
  const values = {
    kind: input.kind,
    title: cleanText(input.title),
    body: cleanText(input.body),
    itemId: input.itemId,
    image: input.image,
    link: input.link,
    schedule: input.schedule,
    sort: input.sort,
    isActive: input.isActive,
  };
  if (input.id) {
    const res = await db
      .update(promotions)
      .set(values)
      .where(eq(promotions.id, input.id))
      .returning({ id: promotions.id });
    if (!res.length) throw new AdminError("Акция не найдена");
    return input.id;
  }
  const [row] = await db.insert(promotions).values(values).returning({ id: promotions.id });
  return row!.id;
}

export async function deletePromotion(db: Db, id: number) {
  await db.delete(promotions).where(eq(promotions.id, id));
}

// ── Rooms, tables, waiters ──────────────────────────────────────────────────

export async function listRooms(db: Db) {
  return db.select().from(rooms).orderBy(asc(rooms.sort), asc(rooms.id));
}

export async function saveRoom(db: Db, input: RoomInput, isNew: boolean) {
  const [existing] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, input.id));
  if (isNew && existing) throw new AdminError(`Зал «${input.id}» уже есть`);
  if (!isNew && !existing) throw new AdminError("Зал не найден");
  const values = {
    name: cleanText(input.name),
    description: cleanText(input.description),
    capacity: input.capacity,
    sort: input.sort,
    isActive: input.isActive,
  };
  if (isNew) await db.insert(rooms).values({ id: input.id, ...values });
  else await db.update(rooms).set(values).where(eq(rooms.id, input.id));
}

export async function deleteRoom(db: Db, id: string) {
  await db.delete(rooms).where(eq(rooms.id, id));
}

export async function listTables(db: Db) {
  return db.select().from(tables).orderBy(asc(tables.sort), asc(tables.code));
}

export async function saveTable(db: Db, input: TableInput, originalCode: string | null) {
  if (input.roomId) {
    const [r] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, input.roomId));
    if (!r) throw new AdminError("Зал не найден");
  }
  const values = {
    roomId: input.roomId,
    label: input.label || null,
    sort: input.sort,
    isActive: input.isActive,
  };
  if (originalCode && originalCode !== input.code) {
    throw new AdminError("Код стола менять нельзя — на нём держатся QR. Создайте новый стол.");
  }
  if (originalCode) {
    await db.update(tables).set(values).where(eq(tables.code, input.code));
    return;
  }
  const [dup] = await db.select({ c: tables.code }).from(tables).where(eq(tables.code, input.code));
  if (dup) throw new AdminError(`Стол «${input.code}» уже есть`);
  await db.insert(tables).values({ code: input.code, ...values });
}

export async function deleteTable(db: Db, code: string) {
  await db.delete(tables).where(eq(tables.code, code));
}

/** New token version: every printed QR of this table stops working. */
export async function reissueTable(db: Db, code: string) {
  const [row] = await db
    .update(tables)
    .set({ tokenVersion: sql`${tables.tokenVersion} + 1` })
    .where(eq(tables.code, code))
    .returning({ v: tables.tokenVersion });
  if (!row) throw new AdminError("Стол не найден");
  return row.v;
}

export async function listWaiters(db: Db) {
  return db.select().from(waiters).orderBy(asc(waiters.sort), asc(waiters.name));
}

export async function saveWaiter(db: Db, input: WaiterInput, isNew: boolean) {
  const [existing] = await db
    .select({ id: waiters.id })
    .from(waiters)
    .where(eq(waiters.id, input.id));
  if (isNew && existing) throw new AdminError(`Официант с кодом «${input.id}» уже есть`);
  if (!isNew && !existing) throw new AdminError("Официант не найден");
  if (input.telegramUserId) {
    const [taken] = await db
      .select({ id: waiters.id })
      .from(waiters)
      .where(and(eq(waiters.telegramUserId, input.telegramUserId), ne(waiters.id, input.id)));
    if (taken) throw new AdminError("Этот Telegram ID уже привязан к другому официанту");
  }
  const values = {
    name: input.name,
    telegramUserId: input.telegramUserId,
    sort: input.sort,
    isActive: input.isActive,
  };
  if (isNew) await db.insert(waiters).values({ id: input.id, ...values });
  else await db.update(waiters).set(values).where(eq(waiters.id, input.id));
}

export async function deleteWaiter(db: Db, id: string) {
  await db.delete(waiters).where(eq(waiters.id, id));
}

// ── Venue ────────────────────────────────────────────────────────────────────

export async function getVenue(db: Db) {
  const [v] = await db.select().from(venue).where(eq(venue.id, 1));
  if (!v) throw new AdminError("Заведение не настроено — запустите seed");
  return v;
}

const cleanList = (l: { ru: string[]; kk?: string[]; en?: string[] }) => {
  const f = (a?: string[]) => (a ?? []).map((s) => s.trim()).filter(Boolean);
  const out: { ru: string[]; kk?: string[]; en?: string[] } = { ru: f(l.ru) };
  if (f(l.kk).length) out.kk = f(l.kk);
  if (f(l.en).length) out.en = f(l.en);
  return out;
};

export async function saveVenue(db: Db, input: VenueInput) {
  const c = input.contacts;
  await db
    .update(venue)
    .set({
      name: input.name,
      serviceRateBp: Math.round(input.servicePercent * 100),
      hours: input.hours,
      contacts: {
        phone: c.phone,
        phoneDisplay: c.phoneDisplay,
        whatsapp: c.whatsapp,
        instagram: c.instagram,
        telegram: c.telegram,
        map2gis: c.map2gis,
        mapYandex: c.mapYandex,
        review2gis: c.review2gis,
        rating: c.rating || undefined,
        reviewsCount: c.reviewsCount || undefined,
        address: cleanText(c.address),
      },
      content: {
        tagline: cleanText(input.content.tagline),
        rules: cleanList(input.content.rules),
        karaokeRules: cleanList(input.content.karaokeRules),
        popularQueries: cleanList(input.content.popularQueries),
      },
      analytics: input.analytics.goatcounterCode
        ? { goatcounterCode: input.analytics.goatcounterCode }
        : {},
      updatedAt: new Date(),
    })
    .where(eq(venue.id, 1));
}

export async function saveFeatures(db: Db, features: VenueFeatures) {
  await db.update(venue).set({ features, updatedAt: new Date() }).where(eq(venue.id, 1));
}

// ── Draft vs published ───────────────────────────────────────────────────────

export type DraftStatus = {
  publishedId: number | null;
  dirty: boolean;
  venue: boolean;
  categories: number;
  added: string[];
  removed: string[];
  changed: string[];
};

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : val,
  );

export function diffSnapshots(
  draft: MenuSnapshot,
  published: MenuSnapshot | null,
  publishedId: number | null,
): DraftStatus {
  if (!published) {
    return {
      publishedId,
      dirty: true,
      venue: true,
      categories: draft.categories.length,
      added: draft.items.map((i) => i.id),
      removed: [],
      changed: [],
    };
  }
  const before = new Map(published.items.map((i) => [i.id, stable(i)]));
  const after = new Map(draft.items.map((i) => [i.id, stable(i)]));
  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const changed = [...after.entries()]
    .filter(([id, v]) => before.has(id) && before.get(id) !== v)
    .map(([id]) => id);
  const catsBefore = new Map(published.categories.map((c) => [c.id, stable(c)]));
  const catChanges =
    draft.categories.filter((c) => catsBefore.get(c.id) !== stable(c)).length +
    published.categories.filter((c) => !draft.categories.some((d) => d.id === c.id)).length;
  const venueChanged =
    stable(draft.venue) !== stable(published.venue) ||
    stable(draft.allergens) !== stable(published.allergens);
  return {
    publishedId,
    dirty: venueChanged || catChanges > 0 || added.length + removed.length + changed.length > 0,
    venue: venueChanged,
    categories: catChanges,
    added,
    removed,
    changed,
  };
}

export async function draftStatus(db: Db): Promise<DraftStatus> {
  const [draft, published] = await Promise.all([buildSnapshot(db), getPublished(db)]);
  return diffSnapshots(draft, published?.snapshot ?? null, published?.id ?? null);
}
