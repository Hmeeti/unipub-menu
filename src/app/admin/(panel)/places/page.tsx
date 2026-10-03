import { PageHeader } from "@/components/admin/page-header";
import { listRooms, listTables } from "@/lib/admin/catalog";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { PlacesBoard } from "./places-board";

export const metadata = { title: "Залы и столы" };

export default async function PlacesPage() {
  await requireAdmin("manager");
  const db = await getDb();
  const [rooms, tables] = await Promise.all([listRooms(db), listTables(db)]);
  return (
    <>
      <PageHeader
        title="Залы и столы"
        description="QR на столе содержит подписанную ссылку: заказ с него нельзя отправить на чужой или несуществующий стол."
        actions={
          <>
            <a
              href="/admin/api/qr"
              download
              className="bg-accent text-on-accent inline-flex min-h-11 items-center rounded-xl px-4 font-bold"
            >
              PDF со всеми QR
            </a>
            <a
              href="/admin/print/tables"
              target="_blank"
              rel="noopener"
              className="border-line bg-surface-2 inline-flex min-h-11 items-center rounded-xl border px-4 font-semibold"
            >
              Печать карточек
            </a>
          </>
        }
      />
      <PlacesBoard
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          capacity: r.capacity,
          sort: r.sort,
          isActive: r.isActive,
        }))}
        tables={tables.map((t) => ({
          code: t.code,
          roomId: t.roomId,
          label: t.label,
          sort: t.sort,
          isActive: t.isActive,
          tokenVersion: t.tokenVersion,
        }))}
      />
    </>
  );
}
