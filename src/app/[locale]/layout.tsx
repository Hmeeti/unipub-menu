import type { Metadata, Viewport } from "next";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { NonceProvider } from "@/components/providers/nonce-provider";
import { routing } from "@/i18n/routing";
import { env } from "@/lib/env";
import { flattenMessages } from "@/lib/i18n/text";
import { headScript } from "@/lib/theme/head-script";
import { manrope, syne } from "../fonts";
import "../globals.css";

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
  "karaoke",
  "promo",
  "common",
] as const;

const OG_LOCALE = { ru: "ru_RU", kk: "kk_KZ", en: "en_US" } as const;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050508" },
    { media: "(prefers-color-scheme: light)", color: "#f3efe9" },
  ],
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  const languages = Object.fromEntries(routing.locales.map((l) => [l, `/${l}`]));
  return {
    metadataBase: new URL(env().APP_URL),
    title: t("title"),
    description: t("description"),
    applicationName: "UNIPUB",
    alternates: {
      canonical: `/${locale}`,
      languages: { ...languages, "x-default": `/${routing.defaultLocale}` },
    },
    openGraph: {
      type: "website",
      siteName: "UNIPUB",
      title: t("title"),
      description: t("description"),
      locale: OG_LOCALE[locale],
      url: `/${locale}`,
    },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const messages = (await getMessages()) as Record<string, unknown>;
  const dict = flattenMessages(messages, CLIENT_NAMESPACES);
  const t = await getTranslations("meta");

  return (
    <html lang={locale} className={`${manrope.variable} ${syne.variable}`} suppressHydrationWarning>
      <head>
        {/* Constant string, no user data; must run before first paint to avoid a theme flash. */}
        {/* eslint-disable-next-line react/no-danger */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: headScript }} />
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
