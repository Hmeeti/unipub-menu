import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LocaleDocument, localeMetadata, localeViewport } from "@/app/locale-document";
import { routing } from "@/i18n/routing";
import { PAGES_ORIGIN, STATIC_ASSETS } from "@/lib/static-menu";
import "../globals.css";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export const dynamicParams = false;
export const viewport = localeViewport;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const meta = await localeMetadata(locale, PAGES_ORIGIN);
  return {
    ...meta,
    manifest: STATIC_ASSETS.manifest,
    icons: { icon: STATIC_ASSETS.icon, apple: STATIC_ASSETS.icon },
    openGraph: { ...meta.openGraph, images: [STATIC_ASSETS.logo] },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <LocaleDocument
      locale={locale}
      head={
        // Remembered for the bare `/unipub-menu/` address (printed QR codes), see `../page.pages.tsx`.
        // eslint-disable-next-line react/no-danger
        <script dangerouslySetInnerHTML={{ __html: rememberLocale(locale) }} />
      }
    >
      {children}
    </LocaleDocument>
  );
}

function rememberLocale(locale: string): string {
  return `try{localStorage.setItem("unipub-locale",${JSON.stringify(locale)})}catch(e){}`;
}
