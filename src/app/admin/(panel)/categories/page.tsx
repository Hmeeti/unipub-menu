import { PageHeader } from "@/components/admin/page-header";
import { listCategories } from "@/lib/admin/catalog";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { CategoriesBoard } from "./categories-board";

export const metadata = { title: "Категории" };

export default async function CategoriesPage() {
  await requireAdmin("manager");
  const cats = await listCategories(await getDb());
  return (
    <>
      <PageHeader
        title="Категории"
        description="Порядок и названия попадут к гостям после публикации меню."
      />
      <CategoriesBoard
        categories={cats.map((c) => ({
          id: c.id,
          icon: c.icon,
          title: c.title,
          isActive: c.isActive,
          itemCount: c.itemCount,
        }))}
      />
    </>
  );
}
