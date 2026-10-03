import { PageHeader } from "@/components/admin/page-header";
import { listWaiters } from "@/lib/admin/catalog";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { StaffBoard } from "./staff-board";

export const metadata = { title: "Официанты" };

export default async function StaffPage() {
  await requireAdmin("manager");
  const waiters = await listWaiters(await getDb());
  return (
    <>
      <PageHeader
        title="Официанты"
        description="Гость может выбрать официанта при вызове. Telegram ID нужен, чтобы бот упоминал официанта и засчитывал ему «Принял»."
      />
      <StaffBoard
        waiters={waiters.map((w) => ({
          id: w.id,
          name: w.name,
          telegramUserId: w.telegramUserId === null ? null : Number(w.telegramUserId),
          sort: w.sort,
          isActive: w.isActive,
        }))}
      />
    </>
  );
}
