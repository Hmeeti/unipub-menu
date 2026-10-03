import { PageHeader } from "@/components/admin/page-header";
import { requireAdmin } from "@/lib/admin/session";
import { listUsers } from "@/lib/admin/users";
import { getDb } from "@/lib/db/client";
import { UsersBoard } from "./users-board";

export const metadata = { title: "Пользователи" };

export default async function UsersPage() {
  const session = await requireAdmin("owner");
  const users = await listUsers(await getDb());
  return (
    <>
      <PageHeader
        title="Пользователи админки"
        description="Владелец — всё. Менеджер — меню, акции, залы, отчёты. Официант — сводка и журнал заказов."
      />
      <UsersBoard
        selfId={session.user.id}
        users={users.map((u) => ({
          ...u,
          telegramUserId: u.telegramUserId === null ? null : Number(u.telegramUserId),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
