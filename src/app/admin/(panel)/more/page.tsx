import { ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/admin/_actions/system";
import { visibleNav } from "@/components/admin/nav-config";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdmin } from "@/lib/admin/session";

export const metadata = { title: "Все разделы" };

export default async function MorePage() {
  const { user } = await requireAdmin("waiter");
  return (
    <>
      <PageHeader title="Все разделы" description={`${user.name} · ${user.login}`} />
      <ul className="border-line bg-surface divide-line divide-y overflow-hidden rounded-2xl border">
        {visibleNav(user.role).map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="flex min-h-14 items-center gap-3 px-4 text-[16px] font-semibold"
            >
              <i.icon className="text-muted size-5" aria-hidden="true" />
              <span className="flex-1">{i.label}</span>
              <ChevronRight className="text-muted size-4" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <form action={logoutAction} className="mt-4">
        <button className="border-line bg-surface text-danger flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-[16px] font-semibold">
          <LogOut className="size-5" aria-hidden="true" />
          Выйти
        </button>
      </form>
    </>
  );
}
