import { count, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  allergens,
  categories,
  itemAllergens,
  items,
  rooms,
  tables,
  venue,
  waiters,
} from "@/lib/db/schema";
import { publishMenu } from "@/lib/menu/repository";
import type { SeedData } from "./import";

export const DEFAULT_ROOMS = [
  { id: "hall", name: { ru: "Основной зал", kk: "Негізгі зал", en: "Main hall" }, capacity: null, sort: 10 },
  { id: "vip", name: { ru: "VIP-зал", kk: "VIP-зал", en: "VIP room" }, capacity: 8, sort: 20 },
  { id: "karaoke", name: { ru: "Караоке-зал", kk: "Караоке-зал", en: "Karaoke room" }, capacity: 12, sort: 30 },
];

export async function isDatabaseEmpty(db: Db) {
  const [row] = await db.select({ n: count() }).from(venue);
  return !row || Number(row.n) === 0;
}

/** Idempotent import of legacy content + sensible defaults for new entities. Publishes version 1. */
export async function seedDatabase(db: Db, seed: SeedData, opts: { publish?: boolean } = {}) {
  await db.transaction(async (tx) => {
    await tx
      .insert(venue)
      .values({
        id: 1,
        name: seed.venue.name,
        serviceRateBp: seed.venue.serviceRateBp,
        hours: seed.venue.hours,
        contacts: seed.venue.contacts,
        content: seed.venue.content,
        features: { orders: true, booking: true, songs: true, promos: true },
        analytics: {},
      })
      .onConflictDoUpdate({
        target: venue.id,
        set: {
          name: seed.venue.name,
          serviceRateBp: seed.venue.serviceRateBp,
          hours: seed.venue.hours,
          contacts: seed.venue.contacts,
          content: seed.venue.content,
          updatedAt: new Date(),
        },
      });

    for (const [i, a] of seed.allergens.entries()) {
      await tx
        .insert(allergens)
        .values({ id: a.id, title: a.title, icon: a.icon, sort: (i + 1) * 10 })
        .onConflictDoUpdate({ target: allergens.id, set: { title: a.title, icon: a.icon } });
    }

    for (const c of seed.categories) {
      await tx
        .insert(categories)
        .values(c)
        .onConflictDoUpdate({ target: categories.id, set: { title: c.title, icon: c.icon, sort: c.sort } });
    }

    for (const it of seed.items) {
      const values = {
        categoryId: it.categoryId,
        name: it.name,
        description: it.description,
        ingredients: it.ingredients,
        price: it.price,
        flags: it.flags,
        spicyLevel: it.spicyLevel,
        weight: it.weight,
        cookTime: it.cookTime,
        images: it.images,
        sort: it.sort,
      };
      await tx
        .insert(items)
        .values({ id: it.id, ...values })
        .onConflictDoUpdate({ target: items.id, set: { ...values, updatedAt: new Date() } });
      await tx.delete(itemAllergens).where(sql`${itemAllergens.itemId} = ${it.id}`);
      if (it.allergens.length) {
        await tx.insert(itemAllergens).values(it.allergens.map((a) => ({ itemId: it.id, allergenId: a })));
      }
    }

    for (const w of seed.waiters) {
      await tx.insert(waiters).values(w).onConflictDoNothing();
    }
    for (const r of DEFAULT_ROOMS) {
      await tx.insert(rooms).values(r).onConflictDoNothing();
    }
    const tableRows = [
      ...Array.from({ length: 20 }, (_, i) => ({ code: String(i + 1), roomId: "hall", sort: i + 1 })),
      { code: "VIP1", roomId: "vip", sort: 101 },
      { code: "VIP2", roomId: "vip", sort: 102 },
      { code: "K1", roomId: "karaoke", sort: 201 },
    ];
    for (const t of tableRows) await tx.insert(tables).values(t).onConflictDoNothing();
  });
  if (opts.publish !== false) return publishMenu(db, { note: "Импорт из старого сайта" });
  return null;
}
