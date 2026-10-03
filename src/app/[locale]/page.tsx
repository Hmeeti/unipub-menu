import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { VIEW_COOKIE } from "@/components/menu/menu-app";
import { MenuScreen } from "@/components/menu/menu-screen";
import { routing } from "@/i18n/routing";
import { getPublicMenu } from "@/lib/menu/public";

export default async function MenuPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const menu = await getPublicMenu();
  if (!menu) {
    const t = await getTranslations("common");
    return <p className="text-muted p-10 text-center">{t("loading")}</p>;
  }

  const view = (await cookies()).get(VIEW_COOKIE)?.value === "list" ? "list" : "grid";
  return <MenuScreen menu={menu} locale={locale} now={new Date()} initialView={view} />;
}
