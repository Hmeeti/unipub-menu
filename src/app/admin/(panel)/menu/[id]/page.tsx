import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getItem, listCategories, listItems } from "@/lib/admin/catalog";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { allergens } from "@/lib/db/schema";
import { ItemEditor } from "./item-editor";
import type { ItemInput } from "@/lib/admin/schemas";
import type { ItemFlag } from "@/lib/domain/types";

export async function generateMetadata({ params }: PageProps<"/admin/menu/[id]">) {
  const { id } = await params;
  return { title: id === "new" ? "Новое блюдо" : `Блюдо ${id}` };
}

export default async function ItemPage({ params, searchParams }: PageProps<"/admin/menu/[id]">) {
  await requireAdmin("manager");
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const isNew = id === "new";
  const [item, cats, all, alls] = await Promise.all([
    isNew ? null : getItem(db, id),
    listCategories(db),
    listItems(db),
    db.select().from(allergens).orderBy(asc(allergens.sort)),
  ]);
  if (!isNew && !item) notFound();
  const firstCat = typeof sp.category === "string" ? sp.category : (cats[0]?.id ?? "");
  const initial: ItemInput = item
    ? {
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        ingredients: item.ingredients,
        price: item.price,
        salePrice: item.salePrice,
        saleSchedule: item.saleSchedule ?? null,
        flags: item.flags as ItemFlag[],
        spicyLevel: item.spicyLevel,
        weight: item.weight ?? null,
        cookTime: item.cookTime ?? null,
        images: item.images,
        pairWith: item.pairWith,
        allergens: item.allergens,
        isActive: item.isActive,
      }
    : {
        id: "",
        categoryId: firstCat,
        name: { ru: "" },
        description: { ru: "" },
        ingredients: { ru: "" },
        price: 0,
        salePrice: null,
        saleSchedule: null,
        flags: [],
        spicyLevel: 0,
        weight: null,
        cookTime: null,
        images: [],
        pairWith: [],
        allergens: [],
        isActive: true,
      };
  return (
    <ItemEditor
      isNew={isNew}
      initial={initial}
      soldOut={item?.soldOut ?? false}
      categories={cats.map((c) => ({ id: c.id, title: c.title.ru }))}
      allergens={alls.map((a) => ({ id: a.id, title: a.title.ru }))}
      others={all.filter((i) => i.id !== id).map((i) => ({ id: i.id, name: i.name.ru }))}
    />
  );
}
