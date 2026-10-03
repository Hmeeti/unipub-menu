import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/menu/header";
import { MenuApp } from "@/components/menu/menu-app";
import { Footer, KaraokeSection, RulesSection } from "@/components/menu/sections";
import { routing } from "@/i18n/routing";
import { hasRole } from "@/lib/admin/roles";
import { getAdminSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { openStatus } from "@/lib/domain/schedule";
import type { PublicMenu } from "@/lib/domain/types";
import { buildSnapshot, getLiveState } from "@/lib/menu/repository";
import { activePromotions, toMenuView } from "@/lib/menu/view";

export const metadata: Metadata = {
  title: "Предпросмотр черновика",
  robots: { index: false, follow: false },
};

/** Draft tables rendered like the public menu; only for signed-in managers, never cached. */
export default async function PreviewPage({ params }: PageProps<"/[locale]/preview">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const session = await getAdminSession();
  if (!session || !hasRole(session.user.role, "manager")) redirect("/admin/login");

  const db = await getDb();
  const [snapshot, live] = await Promise.all([buildSnapshot(db), getLiveState(db)]);
  // Guest actions stay off: the draft may reference dishes the order API would reject.
  const menu: PublicMenu = {
    ...snapshot,
    version: 0,
    ...live,
    features: { ...live.features, orders: false, booking: false, songs: false },
  };
  const now = new Date();
  const status = openStatus(menu.venue.hours, now, menu.venue.timezone);

  return (
    <>
      <div className="bg-gold sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 px-4 py-2 text-center text-[14px] font-bold text-black">
        <span>Предпросмотр черновика — гости видят опубликованную версию. Заказы отключены.</span>
        <Link href="/admin/publish" className="underline">
          К публикации
        </Link>
      </div>
      <Header venue={menu.venue} locale={locale} status={status} />
      <MenuApp
        menu={toMenuView(menu, locale, now)}
        promos={activePromotions(menu, locale, now)}
        initialView="grid"
        isOpenNow={status.open}
      />
      <KaraokeSection venue={menu.venue} locale={locale} features={menu.features} />
      <RulesSection venue={menu.venue} locale={locale} />
      <Footer venue={menu.venue} locale={locale} />
    </>
  );
}
