import type { Metadata, Viewport } from "next";
import { getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { manrope, syne } from "@/app/fonts";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { NonceProvider } from "@/components/providers/nonce-provider";
import { routing } from "@/i18n/routing";
import type { NativeLocale } from "@/lib/domain/types";
import { flattenMessages } from "@/lib/i18n/text";
import { sitePath } from "@/lib/site";
import { headScript } from "@/lib/theme/head-script";

/** Namespaces resolved on the server and shipped to client components as plain strings. */
const CLIENT_NAMESPACES = [
  "nav",
  "search",
  "filters",
  "flags",
  "item",
  "view",
  "cart",
  "split",
  "order",
  "request",
  "karaoke",
  "promo",
  "common",
] as const;

const OG_LOCALE = { ru: "ru_RU", kk: "kk_KZ", en: "en_US" } as const;

export const localeViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050508" },
    { media: "(prefers-color-scheme: light)", color: "#f3efe9" },
  ],
};

/** `siteUrl` is the origin (server build) or the Pages origin; paths get the base path. */
export async function localeMetadata(locale: NativeLocale, siteUrl: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "meta" });
  const languages = Object.fromEntries(routing.locales.map((l) => [l, sitePath(`/${l}`)]));
  return {
    metadataBase: new URL(siteUrl),
    title: t("title"),
    description: t("description"),
    applicationName: "UNIPUB",
    alternates: {
      canonical: sitePath(`/${locale}`),
      languages: { ...languages, "x-default": sitePath(`/${routing.defaultLocale}`) },
    },
    openGraph: {
      type: "website",
      siteName: "UNIPUB",
      title: t("title"),
      description: t("description"),
      locale: OG_LOCALE[locale],
      url: sitePath(`/${locale}`),
    },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false },
  };
}

export async function LocaleDocument({
  locale,
  nonce,
  head,
  children,
}: {
  locale: NativeLocale;
  nonce?: string;
  head?: ReactNode;
  children: ReactNode;
}) {
  const messages = (await getMessages()) as Record<string, unknown>;
  const dict = flattenMessages(messages, CLIENT_NAMESPACES);
  const t = await getTranslations("meta");

  return (
    <html lang={locale} className={`${manrope.variable} ${syne.variable}`} suppressHydrationWarning>
      <head>
        {/* Constant string, no user data; must run before first paint to avoid a theme flash. */}
        {/* eslint-disable-next-line react/no-danger */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: headScript }} />
        {head}
      </head>
      <body>
        <a
          href="#menu"
          className="bg-accent text-on-accent sr-only z-[200] rounded-xl px-4 py-3 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t("skipToMenu")}
        </a>
        <div className="ambient" aria-hidden="true" />
        <NonceProvider nonce={nonce} />
        <I18nProvider locale={locale} dict={dict}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
