import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { listCategories, listItems } from "@/lib/admin/catalog";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { ItemsBoard, type BoardItem } from "./items-board";

export const metadata = { title: "Блюда" };

export default async function MenuAdminPage() {
  await requireAdmin("manager");
  const db = await getDb();
  const [rows, cats] = await Promise.all([listItems(db), listCategories(db)]);
  const items: BoardItem[] = rows.map((r) => ({
    id: r.id,
    categoryId: r.categoryId,
    name: r.name.ru,
    alt: [r.name.kk, r.name.en, r.id].filter(Boolean).join(" "),
    price: r.price,
    salePrice: r.salePrice,
    soldOut: r.soldOut,
    isActive: r.isActive,
    image: r.images[0] ?? null,
    missing: [!r.name.kk && "KK", !r.name.en && "EN"].filter(Boolean) as string[],
  }));
  return (
    <>
      <PageHeader
        title="Блюда"
        description="Стоп-лист применяется сразу. Остальные правки попадают в черновик и видны гостям после публикации."
        actions={
          <Link
            href="/admin/menu/new"
            className="bg-accent text-on-accent inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-bold"
          >
            <Plus className="size-4" aria-hidden="true" />
            Новое блюдо
          </Link>
        }
      />
      <ItemsBoard
        items={items}
        categories={cats.map((c) => ({ id: c.id, title: c.title.ru, isActive: c.isActive }))}
      />
    </>
  );
}
