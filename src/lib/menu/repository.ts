import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db/client";
import {
  allergens,
  categories,
  itemAllergens,
  items,
  menuVersions,
  promotions,
  rooms,
  venue,
  waiters,
} from "@/lib/db/schema";
import type {
  ItemFlag,
  MenuSnapshot,
  PublicItem,
  PublicMenu,
  VenueFeatures,
} from "@/lib/domain/types";

type Conn = Db | Tx;

export async function buildSnapshot(db: Conn): Promise<MenuSnapshot> {
  const [v] = await db.select().from(venue).where(eq(venue.id, 1));
  if (!v) throw new Error("venue row missing — run the seed");
  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sort), asc(categories.id));
  const alls = await db.select().from(allergens).orderBy(asc(allergens.sort), asc(allergens.id));
  const activeCatIds = new Set(cats.map((c) => c.id));
  const rows = await db
    .select()
    .from(items)
    .where(eq(items.isActive, true))
    .orderBy(asc(items.sort), asc(items.id));
  const links = await db.select().from(itemAllergens);
  const byItem = new Map<string, string[]>();
  for (const l of links) byItem.set(l.itemId, [...(byItem.get(l.itemId) ?? []), l.allergenId]);

  const publicItems: PublicItem[] = rows
    .filter((r) => activeCatIds.has(r.categoryId))
    .map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      name: r.name,
      description: r.description,
      ingredients: r.ingredients,
      price: r.price,
      salePrice: r.salePrice,
      saleSchedule: r.saleSchedule ?? null,
      flags: r.flags as ItemFlag[],
      spicyLevel: r.spicyLevel,
      weight: r.weight ?? null,
      cookTime: r.cookTime ?? null,
      images: r.images,
      pairWith: r.pairWith,
      allergens: (byItem.get(r.id) ?? []).sort(),
      sort: r.sort,
    }));

  return {
    venue: {
      name: v.name,
      timezone: v.timezone,
      serviceRateBp: v.serviceRateBp,
      hours: v.hours,
      contacts: v.contacts,
      content: v.content,
    },
    categories: cats.map((c) => ({ id: c.id, icon: c.icon, title: c.title, sort: c.sort })),
    allergens: alls.map((a) => ({ id: a.id, icon: a.icon, title: a.title })),
    items: publicItems,
  };
}

export async function publishMenu(
  db: Db,
  opts: { userId?: number | null; note?: string | null; restoredFrom?: number | null } = {},
) {
  const snapshot = await buildSnapshot(db);
  const [row] = await db
    .insert(menuVersions)
    .values({
      snapshot,
      note: opts.note ?? null,
      createdBy: opts.userId ?? null,
      restoredFrom: opts.restoredFrom ?? null,
    })
    .returning({ id: menuVersions.id, createdAt: menuVersions.createdAt });
  return row!;
}

export async function getPublished(db: Db): Promise<{ id: number; snapshot: MenuSnapshot } | null> {
  const [row] = await db
    .select({ id: menuVersions.id, snapshot: menuVersions.snapshot })
    .from(menuVersions)
    .orderBy(desc(menuVersions.id))
    .limit(1);
  return row ?? null;
}

export function applyFeatureKillSwitches(features: VenueFeatures): VenueFeatures {
  return {
    orders: features.orders,
    booking: features.booking && process.env.FEATURE_BOOKING !== "off",
    songs: features.songs && process.env.FEATURE_SONGS !== "off",
    promos: features.promos && process.env.FEATURE_PROMOS !== "off",
  };
}

/** Operational state that changes without publishing: stop-list, promotions, staff, rooms, flags. */
export async function getLiveState(db: Db) {
  const sold = await db.select({ id: items.id }).from(items).where(eq(items.soldOut, true));
  const promos = await db
    .select()
    .from(promotions)
    .where(eq(promotions.isActive, true))
    .orderBy(asc(promotions.sort), asc(promotions.id));
  const ws = await db
    .select({ id: waiters.id, name: waiters.name })
    .from(waiters)
    .where(eq(waiters.isActive, true))
    .orderBy(asc(waiters.sort), asc(waiters.name));
  const rs = await db
    .select({ id: rooms.id, name: rooms.name, capacity: rooms.capacity })
    .from(rooms)
    .where(eq(rooms.isActive, true))
    .orderBy(asc(rooms.sort));
  const [v] = await db.select({ features: venue.features }).from(venue).where(eq(venue.id, 1));
  return {
    soldOut: sold.map((s) => s.id),
    promotions: promos.map((p) => ({
      id: p.id,
      kind: p.kind,
      title: p.title,
      body: p.body,
      itemId: p.itemId,
      image: p.image ?? null,
      link: p.link,
      schedule: p.schedule,
    })),
    waiters: ws,
    rooms: rs,
    features: applyFeatureKillSwitches(
      v?.features ?? { orders: true, booking: true, songs: true, promos: true },
    ),
  };
}

export async function composePublicMenu(db: Db): Promise<PublicMenu | null> {
  const published = await getPublished(db);
  if (!published) return null;
  const live = await getLiveState(db);
  return { ...published.snapshot, version: published.id, ...live };
}

/** Rollback: writes an old snapshot back into the draft tables and publishes it as a new version. */
export async function restoreVersion(db: Db, versionId: number, userId: number | null) {
  const [row] = await db.select().from(menuVersions).where(eq(menuVersions.id, versionId));
  if (!row) throw new Error("version_not_found");
  const snap = row.snapshot;
  await db.transaction(async (tx) => {
    await tx
      .update(venue)
      .set({
        name: snap.venue.name,
        serviceRateBp: snap.venue.serviceRateBp,
        hours: snap.venue.hours,
        contacts: snap.venue.contacts,
        content: snap.venue.content,
        updatedAt: new Date(),
      })
      .where(eq(venue.id, 1));
    await tx.update(categories).set({ isActive: false });
    for (const c of snap.categories) {
      await tx
        .insert(categories)
        .values({ id: c.id, icon: c.icon, title: c.title, sort: c.sort, isActive: true })
        .onConflictDoUpdate({
          target: categories.id,
          set: {
            icon: c.icon,
            title: c.title,
            sort: c.sort,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }
    await tx.update(items).set({ isActive: false });
    for (const it of snap.items) {
      const values = {
        categoryId: it.categoryId,
        name: it.name,
        description: it.description,
        ingredients: it.ingredients,
        price: it.price,
        salePrice: it.salePrice,
        saleSchedule: it.saleSchedule,
        flags: it.flags,
        spicyLevel: it.spicyLevel,
        weight: it.weight,
        cookTime: it.cookTime,
        images: it.images,
        pairWith: it.pairWith,
        sort: it.sort,
        isActive: true,
      };
      await tx
        .insert(items)
        .values({ id: it.id, ...values })
        .onConflictDoUpdate({ target: items.id, set: { ...values, updatedAt: new Date() } });
      await tx.delete(itemAllergens).where(eq(itemAllergens.itemId, it.id));
      if (it.allergens.length) {
        await tx
          .insert(itemAllergens)
          .values(it.allergens.map((a) => ({ itemId: it.id, allergenId: a })));
      }
    }
  });
  return publishMenu(db, { userId, note: `Откат к версии #${versionId}`, restoredFrom: versionId });
}

export async function setSoldOut(db: Db, ids: string[], soldOut: boolean) {
  if (!ids.length) return 0;
  const res = await db
    .update(items)
    .set({ soldOut, updatedAt: new Date() })
    .where(inArray(items.id, ids))
    .returning({ id: items.id });
  return res.length;
}

export async function itemExists(db: Db, id: string) {
  const [r] = await db
    .select({ n: sql<number>`1` })
    .from(items)
    .where(and(eq(items.id, id)));
  return Boolean(r);
}
