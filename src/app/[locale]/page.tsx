import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Header } from "@/components/menu/header";
import { MenuApp, VIEW_COOKIE } from "@/components/menu/menu-app";
import { Footer, KaraokeSection, RulesSection, Splash } from "@/components/menu/sections";
import { routing } from "@/i18n/routing";
import { openStatus } from "@/lib/domain/schedule";
import { getPublicMenu } from "@/lib/menu/public";
import { activePromotions, toMenuView } from "@/lib/menu/view";

export default async function MenuPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const menu = await getPublicMenu();
  if (!menu) {
    const t = await getTranslations("common");
    return <p className="text-muted p-10 text-center">{t("loading")}</p>;
  }

  const now = new Date();
  const status = openStatus(menu.venue.hours, now, menu.venue.timezone);
  const view = (await cookies()).get(VIEW_COOKIE)?.value === "list" ? "list" : "grid";

  return (
    <>
      <Splash serviceRateBp={menu.venue.serviceRateBp} />
      <Header venue={menu.venue} locale={locale} status={status} />
      <MenuApp
        menu={toMenuView(menu, locale, now)}
        promos={activePromotions(menu, locale, now)}
        initialView={view}
        isOpenNow={status.open}
      />
      <KaraokeSection venue={menu.venue} locale={locale} />
      <RulesSection venue={menu.venue} locale={locale} />
      <Footer venue={menu.venue} locale={locale} />
    </>
  );
}
