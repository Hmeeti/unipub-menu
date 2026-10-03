import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { LocaleDocument, localeMetadata, localeViewport } from "@/components/menu/locale-document";
import { routing } from "@/i18n/routing";
import { env } from "@/lib/env";
import "../globals.css";

export const viewport = localeViewport;

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return localeMetadata(locale, env().APP_URL);
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <LocaleDocument locale={locale} nonce={nonce}>
      {children}
    </LocaleDocument>
  );
}
