import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { MenuScreen } from "@/components/menu/menu-screen";
import { routing } from "@/i18n/routing";
import { staticMenu } from "@/lib/static-menu";

export default async function StaticMenuPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <MenuScreen menu={staticMenu()} locale={locale} now={new Date()} initialView="grid" prebuilt />
  );
}
