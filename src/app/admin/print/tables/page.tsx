import Link from "next/link";
import { listRooms, listTables } from "@/lib/admin/catalog";
import { qrSvg, tableQrUrl } from "@/lib/admin/qr";
import { requireAdmin } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { PrintButton } from "./print-button";

export const metadata = { title: "Печать QR" };

export default async function PrintTablesPage(props: PageProps<"/admin/print/tables">) {
  await requireAdmin("manager");
  const { codes } = await props.searchParams;
  const wanted =
    typeof codes === "string" ? codes.split(",").map((c) => c.trim().toUpperCase()) : null;
  const db = await getDb();
  const [tables, rooms] = await Promise.all([listTables(db), listRooms(db)]);
  const roomName = new Map(rooms.map((r) => [r.id, r.name.ru]));
  const list = tables.filter((t) => (wanted ? wanted.includes(t.code) : t.isActive));

  return (
    <div className="min-h-dvh bg-white text-black">
      <div className="flex items-center gap-3 p-4 print:hidden">
        <Link href="/admin/places" className="font-semibold underline">
          ← Назад
        </Link>
        <span className="flex-1 text-sm text-neutral-600">
          {list.length} карточек, по 4 на лист A4
        </span>
        <PrintButton />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2">
        {list.map((t) => (
          <section
            key={t.code}
            className="flex break-inside-avoid flex-col items-center gap-2 border border-dashed border-neutral-300 p-6 text-center print:h-[148mm]"
          >
            <div className="text-[28px] font-black tracking-wide text-[#c90f61]">UNIPUB</div>
            <div className="text-[13px] font-semibold">Меню · Заказ · Караоке</div>
            <div
              className="my-2 w-[60mm] max-w-full"
              // qrSvg emits only numeric path data and a sanitized title
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                __html: qrSvg(tableQrUrl(t.code, t.tokenVersion), `Стол ${t.code}`),
              }}
            />
            <div className="text-[13px] uppercase">Стол</div>
            <div className="text-[44px] leading-none font-black">{t.code}</div>
            {t.roomId ? (
              <div className="text-[13px] text-neutral-600">{roomName.get(t.roomId)}</div>
            ) : null}
            <div className="mt-2 text-[12px] text-neutral-700">
              Наведите камеру телефона на код
              <br />
              Телефонның камерасын кодқа бағыттаңыз
              <br />
              Point your phone camera at the code
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
