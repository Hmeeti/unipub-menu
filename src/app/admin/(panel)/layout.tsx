import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/nav";
import { requireAdmin } from "@/lib/admin/session";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { user } = await requireAdmin("waiter");
  return (
    <>
      <AdminNav role={user.role} name={`${user.name} · ${user.login}`} />
      <main className="mx-auto w-full max-w-5xl px-4 pt-5 pb-28 lg:pt-8 lg:pb-12 lg:pl-64">
        {children}
      </main>
    </>
  );
}
