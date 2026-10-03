"use client";

import { LogOut, Menu as MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/admin/_actions/system";
import type { AdminRole } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { visibleNav } from "./nav-config";

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop: sidebar with every section. Mobile: bottom bar with the main ones + «Ещё». */
export function AdminNav({ role, name }: { role: AdminRole; name: string }) {
  const pathname = usePathname();
  const items = visibleNav(role);
  const primary = items.filter((i) => i.primary);
  const moreActive = !primary.some((i) => isActive(pathname, i.href));
  return (
    <>
      <aside className="border-line bg-bg-2 fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r lg:flex">
        <div className="px-5 pt-5 pb-4">
          <div className="wordmark text-text text-2xl">
            unipub
            <span className="wordmark-dot" aria-hidden="true" />
          </div>
          <div className="text-muted mt-1 truncate text-[13px]">{name}</div>
        </div>
        <nav aria-label="Разделы" className="min-h-0 flex-1 overflow-y-auto px-3">
          <ul className="flex flex-col gap-0.5">
            {items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={isActive(pathname, i.href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold",
                    isActive(pathname, i.href)
                      ? "bg-surface-2 text-text"
                      : "text-muted hover:text-text",
                  )}
                >
                  <i.icon className="size-[18px]" aria-hidden="true" />
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <form action={logoutAction} className="p-3">
          <button className="text-muted hover:text-text flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-semibold">
            <LogOut className="size-[18px]" aria-hidden="true" />
            Выйти
          </button>
        </form>
      </aside>
      <nav
        aria-label="Разделы"
        className="border-line bg-bg-2/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul
          className="mx-auto grid max-w-xl"
          style={{ gridTemplateColumns: `repeat(${primary.length + 1}, 1fr)` }}
        >
          {[
            ...primary,
            { href: "/admin/more", label: "Ещё", icon: MenuIcon, min: "waiter" as const },
          ].map((i) => {
            const active = i.href === "/admin/more" ? moreActive : isActive(pathname, i.href);
            return (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold",
                    active ? "text-pink-text" : "text-muted",
                  )}
                >
                  <i.icon className="size-5" aria-hidden="true" />
                  {i.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
