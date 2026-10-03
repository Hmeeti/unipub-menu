import { PageHeader } from "@/components/admin/page-header";
import { listItems, listPromotions } from "@/lib/admin/catalog";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { isScheduleActive } from "@/lib/domain/schedule";
import { PromotionsBoard } from "./promotions-board";

export const metadata = { title: "Акции" };

export default async function PromotionsPage() {
  await requireAdmin("manager");
  const db = await getDb();
  const [promos, all] = await Promise.all([listPromotions(db), listItems(db)]);
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Акции и «Блюдо дня»"
        description="Баннеры под шапкой меню. Применяются сразу, по расписанию (время Алматы)."
      />
      <PromotionsBoard
        promotions={promos.map((p) => ({
          id: p.id,
          kind: p.kind,
          title: p.title,
          body: p.body,
          itemId: p.itemId,
          image: p.image ?? null,
          link: p.link,
          schedule: p.schedule,
          sort: p.sort,
          isActive: p.isActive,
          liveNow: p.isActive && isScheduleActive(p.schedule, now),
        }))}
        items={all.filter((i) => i.isActive).map((i) => ({ id: i.id, name: i.name.ru }))}
      />
    </>
  );
}
