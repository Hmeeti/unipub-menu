import { asc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
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
import type { ItemFlag } from "@/lib/domain/types";
import { AdminError } from "./errors";
import {
  categorySchema,
  featuresSchema,
  i18nText,
  imageAssetSchema,
  itemSchema,
  promotionSchema,
  roomSchema,
  scheduleSchema,
  tableSchema,
  waiterSchema,
} from "./schemas";
import { listItems } from "./catalog";

export const BACKUP_FORMAT = "unipub-menu";
export const BACKUP_VERSION = 1;

const sort = z.int().min(0).max(1_000_000);

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  venue: z.object({
    name: z.string().min(1).max(60),
    timezone: z.string().max(60),
    serviceRateBp: z.int().min(0).max(3000),
    hours: z.array(z.object({ open: z.string(), close: z.string() }).nullable()).length(7),
    contacts: z.record(z.string(), z.unknown()),
    content: z.record(z.string(), z.unknown()),
    features: featuresSchema,
    analytics: z.record(z.string(), z.unknown()),
  }),
  allergens: z
    .array(
      z.object({ id: z.string().max(40), title: i18nText(60), icon: z.string().max(24), sort }),
    )
    .max(100),
  categories: z.array(categorySchema.extend({ sort })).max(200),
  items: z
    .array(
      z.intersection(
        itemSchema,
        z.object({ sort, soldOut: z.boolean(), saleSchedule: scheduleSchema.nullable() }),
      ),
    )
    .max(2000),
  rooms: z.array(roomSchema).max(100),
  tables: z.array(tableSchema.extend({ tokenVersion: z.int().min(1).max(1_000_000) })).max(1000),
  waiters: z.array(waiterSchema).max(200),
  promotions: z
    .array(promotionSchema.extend({ id: z.null(), image: imageAssetSchema.nullable() }))
    .max(200),
});
export type Backup = z.infer<typeof backupSchema>;

export async function exportBackup(db: Db): Promise<Backup> {
  const [v] = await db.select().from(venue).where(eq(venue.id, 1));
  if (!v) throw new AdminError("Заведение не настроено");
  const all = await listItems(db);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    venue: {
      name: v.name,
      timezone: v.timezone,
      serviceRateBp: v.serviceRateBp,
      hours: v.hours,
      contacts: v.contacts,
      content: v.content,
      features: v.features,
      analytics: v.analytics,
    },
    allergens: (await db.select().from(allergens).orderBy(asc(allergens.sort))).map((a) => ({
      id: a.id,
      title: { ru: a.title.ru, kk: a.title.kk, en: a.title.en },
      icon: a.icon,
      sort: a.sort,
    })),
    categories: (await db.select().from(categories).orderBy(asc(categories.sort))).map((c) => ({
      id: c.id,
      icon: c.icon,
      title: c.title,
      isActive: c.isActive,
      sort: c.sort,
    })),
    items: all.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      name: i.name,
      description: i.description,
      ingredients: i.ingredients,
      price: i.price,
      salePrice: i.salePrice,
      saleSchedule: i.saleSchedule ?? null,
      flags: i.flags as ItemFlag[],
      spicyLevel: i.spicyLevel,
      weight: i.weight ?? null,
      cookTime: i.cookTime ?? null,
      images: i.images,
      pairWith: i.pairWith,
      allergens: i.allergens,
      isActive: i.isActive,
      soldOut: i.soldOut,
      sort: i.sort,
    })),
    rooms: (await db.select().from(rooms).orderBy(asc(rooms.sort))).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      capacity: r.capacity,
      sort: r.sort,
      isActive: r.isActive,
    })),
    tables: (await db.select().from(tables).orderBy(asc(tables.sort))).map((t) => ({
      code: t.code,
      roomId: t.roomId,
      label: t.label,
      sort: t.sort,
      isActive: t.isActive,
      tokenVersion: t.tokenVersion,
    })),
    waiters: (await db.select().from(waiters).orderBy(asc(waiters.sort))).map((w) => ({
      id: w.id,
      name: w.name,
      telegramUserId: w.telegramUserId,
      sort: w.sort,
      isActive: w.isActive,
    })),
    promotions: (await db.select().from(promotions).orderBy(asc(promotions.sort))).map((p) => ({
      id: null,
      kind: p.kind,
      title: p.title,
      body: p.body,
      itemId: p.itemId,
      image: p.image ?? null,
      link: p.link,
      schedule: p.schedule,
      sort: p.sort,
      isActive: p.isActive,
    })),
  };
}

export type ImportSummary = { items: number; categories: number; hidden: number };

/**
 * Restores a backup into the draft: everything in the file is upserted, menu entities missing from
 * it are hidden (not deleted), promotions are replaced. Publishing stays a separate, explicit step.
 */
export async function importBackup(db: Db, raw: unknown): Promise<ImportSummary> {
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AdminError(
      `Файл не подходит: ${issue ? `${issue.path.join(".")} — ${issue.message}` : "неверный формат"}`,
    );
  }
  const b = parsed.data;
  const catIds = new Set(b.categories.map((c) => c.id));
  const itemIds = new Set(b.items.map((i) => i.id));
  const allergenIds = new Set(b.allergens.map((a) => a.id));
  for (const it of b.items) {
    if (!catIds.has(it.categoryId))
      throw new AdminError(`Блюдо ${it.id}: нет категории ${it.categoryId}`);
    if (it.allergens.some((a) => !allergenIds.has(a)))
      throw new AdminError(`Блюдо ${it.id}: неизвестный аллерген`);
  }
  const roomIds = new Set(b.rooms.map((r) => r.id));
  let hidden = 0;
  await db.transaction(async (tx) => {
    await tx
      .update(venue)
      .set({
        name: b.venue.name,
        timezone: b.venue.timezone,
        serviceRateBp: b.venue.serviceRateBp,
        hours: b.venue.hours,
        contacts: b.venue.contacts as never,
        content: b.venue.content as never,
        features: b.venue.features,
        analytics: b.venue.analytics as never,
        updatedAt: new Date(),
      })
      .where(eq(venue.id, 1));
    for (const a of b.allergens) {
      await tx
        .insert(allergens)
        .values(a)
        .onConflictDoUpdate({
          target: allergens.id,
          set: { title: a.title, icon: a.icon, sort: a.sort },
        });
    }
    for (const c of b.categories) {
      const values = {
        icon: c.icon,
        title: c.title,
        sort: c.sort,
        isActive: c.isActive,
        updatedAt: new Date(),
      };
      await tx
        .insert(categories)
        .values({ id: c.id, ...values })
        .onConflictDoUpdate({ target: categories.id, set: values });
    }
    for (const it of b.items) {
      const values = {
        categoryId: it.categoryId,
        name: it.name,
        description: it.description,
        ingredients: it.ingredients,
        price: it.price,
        salePrice: it.salePrice,
        saleSchedule: it.saleSchedule,
        soldOut: it.soldOut,
        flags: it.flags as ItemFlag[],
        spicyLevel: it.spicyLevel,
        weight: it.weight,
        cookTime: it.cookTime,
        images: it.images,
        pairWith: it.pairWith.filter((p) => itemIds.has(p)),
        sort: it.sort,
        isActive: it.isActive,
        updatedAt: new Date(),
      };
      await tx
        .insert(items)
        .values({ id: it.id, ...values })
        .onConflictDoUpdate({ target: items.id, set: values });
      await tx.delete(itemAllergens).where(eq(itemAllergens.itemId, it.id));
      if (it.allergens.length)
        await tx
          .insert(itemAllergens)
          .values(it.allergens.map((a) => ({ itemId: it.id, allergenId: a })));
    }
    if (itemIds.size) {
      const res = await tx
        .update(items)
        .set({ isActive: false })
        .where(notInArray(items.id, [...itemIds]))
        .returning({ id: items.id });
      hidden += res.length;
    }
    if (catIds.size)
      await tx
        .update(categories)
        .set({ isActive: false })
        .where(notInArray(categories.id, [...catIds]));
    for (const r of b.rooms) {
      const { id: _id, ...values } = r;
      await tx.insert(rooms).values(r).onConflictDoUpdate({ target: rooms.id, set: values });
    }
    for (const t of b.tables) {
      const { code, ...values } = t;
      const roomId = values.roomId && roomIds.has(values.roomId) ? values.roomId : null;
      const existing = await tx
        .select({ code: tables.code })
        .from(tables)
        .where(eq(tables.code, code));
      const room = roomId
        ? (await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)))[0]
        : null;
      const row = { ...values, roomId: room ? roomId : null };
      if (existing.length) await tx.update(tables).set(row).where(eq(tables.code, code));
      else await tx.insert(tables).values({ code, ...row });
    }
    for (const w of b.waiters) {
      const { id: _id, ...values } = w;
      if (values.telegramUserId)
        await tx
          .update(waiters)
          .set({ telegramUserId: null })
          .where(eq(waiters.telegramUserId, values.telegramUserId));
      await tx.insert(waiters).values(w).onConflictDoUpdate({ target: waiters.id, set: values });
    }
    await tx.delete(promotions);
    const validItemIds = itemIds.size
      ? new Set(
          (
            await tx
              .select({ id: items.id })
              .from(items)
              .where(inArray(items.id, [...itemIds]))
          ).map((r) => r.id),
        )
      : new Set<string>();
    for (const p of b.promotions) {
      const { id: _id, ...values } = p;
      await tx
        .insert(promotions)
        .values({ ...values, itemId: p.itemId && validItemIds.has(p.itemId) ? p.itemId : null });
    }
  });
  return { items: b.items.length, categories: b.categories.length, hidden };
}
