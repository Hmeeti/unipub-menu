"use server";

import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import {
  bulkItems,
  deleteCategory,
  deleteItem,
  deletePromotion,
  reorder,
  saveCategory,
  saveItem,
  savePromotion,
} from "@/lib/admin/catalog";
import { AdminError } from "@/lib/admin/errors";
import {
  bulkSchema,
  categorySchema,
  itemSchema,
  promotionSchema,
  slug,
  type CategoryInput,
  type ItemInput,
  type PromotionInput,
} from "@/lib/admin/schemas";
import { runAction } from "@/lib/admin/session";
import type { ImageAsset } from "@/lib/domain/types";
import { ImageError, MAX_UPLOAD_BYTES, processImage, storeImage } from "@/lib/media/images";
import { publishMenu, restoreVersion, setSoldOut } from "@/lib/menu/repository";
import { TranslateError, translateTexts } from "@/lib/translate/provider";

export async function saveItemAction(raw: ItemInput, isNew: boolean) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const input = itemSchema.parse(raw);
      const { before } = await saveItem(db, input, isNew);
      await audit(
        db,
        actor,
        isNew ? "item.create" : "item.update",
        { type: "item", id: input.id },
        {
          name: input.name.ru,
          ...(before && before.price !== input.price ? { price: [before.price, input.price] } : {}),
        },
      );
      return { id: input.id };
    },
    { message: "Сохранено в черновик" },
  );
}

export async function deleteItemAction(id: string) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const itemId = slug.parse(id);
      await deleteItem(db, itemId);
      await audit(db, actor, "item.delete", { type: "item", id: itemId });
      return null;
    },
    { menu: true, message: "Блюдо удалено" },
  );
}

export async function setSoldOutAction(id: string, soldOut: boolean) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const itemId = slug.parse(id);
      const n = await setSoldOut(db, [itemId], soldOut);
      if (!n) throw new AdminError("Блюдо не найдено");
      await audit(db, actor, "item.sold_out", { type: "item", id: itemId }, { soldOut });
      return null;
    },
    { menu: true },
  );
}

export async function bulkItemsAction(raw: z.input<typeof bulkSchema>) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const input = bulkSchema.parse(raw);
      const n = await bulkItems(db, input.ids, input.action, input.categoryId);
      await audit(
        db,
        actor,
        "item.bulk",
        { type: "item" },
        { action: input.action, ids: input.ids, categoryId: input.categoryId },
      );
      return { count: n };
    },
    { menu: true },
  );
}

const idList = z.array(slug).min(1).max(1000);

export async function reorderAction(kind: "items" | "categories", ids: string[]) {
  return runAction("manager", async ({ db, actor }) => {
    const list = idList.parse(ids);
    await reorder(db, kind === "items" ? "items" : "categories", list);
    await audit(
      db,
      actor,
      kind === "items" ? "item.reorder" : "category.reorder",
      { type: kind },
      { ids: list },
    );
    return null;
  });
}

export async function uploadPhotoAction(form: FormData) {
  return runAction("manager", async ({ db, actor }) => {
    const file = form.get("file");
    const folder = form.get("folder") === "promo" ? "promo" : "menu";
    const name = String(form.get("name") ?? "img");
    if (!(file instanceof File) || file.size === 0) throw new AdminError("Выберите файл");
    if (file.size > MAX_UPLOAD_BYTES) throw new AdminError("Файл больше 8 МБ");
    try {
      const processed = await processImage(Buffer.from(await file.arrayBuffer()));
      const asset: ImageAsset = await storeImage(processed, folder, name);
      await audit(db, actor, "item.photo", { type: folder, id: name }, { src: asset.src });
      return asset;
    } catch (err) {
      if (err instanceof ImageError) throw new AdminError(err.message);
      throw err;
    }
  });
}

const translateInput = z.object({
  texts: z.array(z.string().max(1000)).min(1).max(20),
  targets: z
    .array(z.enum(["kk", "en"]))
    .min(1)
    .max(2),
});

/** Fills KK/EN from RU through the server-side provider; the manager reviews before saving. */
export async function translateAction(raw: z.input<typeof translateInput>) {
  return runAction("manager", async () => {
    const { texts, targets } = translateInput.parse(raw);
    const result: Record<string, string[]> = {};
    const nonEmpty = texts.map((t, i) => [t.trim(), i] as const).filter(([t]) => t);
    try {
      for (const lang of targets) {
        const out = await translateTexts(
          nonEmpty.map(([t]) => t),
          lang,
        );
        const full = texts.map(() => "");
        nonEmpty.forEach(([, i], k) => (full[i] = out[k] ?? ""));
        result[lang] = full;
      }
    } catch (err) {
      if (err instanceof TranslateError) throw new AdminError(err.message);
      throw err;
    }
    return result;
  });
}

export async function saveCategoryAction(raw: CategoryInput, isNew: boolean) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const input = categorySchema.parse(raw);
      await saveCategory(db, input, isNew);
      await audit(
        db,
        actor,
        "category.save",
        { type: "category", id: input.id },
        { title: input.title.ru, isNew },
      );
      return null;
    },
    { message: "Сохранено в черновик" },
  );
}

export async function deleteCategoryAction(id: string) {
  return runAction("manager", async ({ db, actor }) => {
    const cid = slug.parse(id);
    await deleteCategory(db, cid);
    await audit(db, actor, "category.delete", { type: "category", id: cid });
    return null;
  });
}

export async function savePromotionAction(raw: PromotionInput) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const input = promotionSchema.parse(raw);
      const id = await savePromotion(db, input);
      await audit(db, actor, "promo.save", { type: "promotion", id }, { title: input.title.ru });
      return { id };
    },
    { menu: true, message: "Акция сохранена" },
  );
}

export async function deletePromotionAction(id: number) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const pid = z.int().positive().parse(id);
      await deletePromotion(db, pid);
      await audit(db, actor, "promo.delete", { type: "promotion", id: pid });
      return null;
    },
    { menu: true },
  );
}

export async function publishAction(note: string) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const clean = z.string().trim().max(200).parse(note) || null;
      const v = await publishMenu(db, { userId: actor.id, note: clean });
      await audit(db, actor, "menu.publish", { type: "menu_version", id: v.id }, { note: clean });
      return { id: v.id };
    },
    { menu: true, message: "Меню опубликовано" },
  );
}

export async function rollbackAction(versionId: number) {
  return runAction(
    "manager",
    async ({ db, actor }) => {
      const id = z.int().positive().parse(versionId);
      try {
        const v = await restoreVersion(db, id, actor.id);
        await audit(
          db,
          actor,
          "menu.rollback",
          { type: "menu_version", id: v.id },
          { restoredFrom: id },
        );
        return { id: v.id };
      } catch (err) {
        if (err instanceof Error && err.message === "version_not_found")
          throw new AdminError("Версия не найдена");
        throw err;
      }
    },
    { menu: true, message: "Откат выполнен и опубликован" },
  );
}
