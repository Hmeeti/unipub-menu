import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { sitePath } from "@/lib/site";
import { PAGES_ORIGIN, STATIC_ASSETS } from "@/lib/static-menu";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PAGES_ORIGIN),
  title: "UNIPUB — Меню",
  description: "UNIPUB — электронное меню караоке-бара и ресторана в Таразе.",
  manifest: STATIC_ASSETS.manifest,
  icons: { icon: STATIC_ASSETS.icon, apple: STATIC_ASSETS.icon },
  alternates: { canonical: sitePath(`/${routing.defaultLocale}`) },
  openGraph: {
    type: "website",
    siteName: "UNIPUB",
    title: "UNIPUB — Меню",
    description: "Karaoke Bar & Restaurant · Taraz",
    url: sitePath("/"),
    images: [STATIC_ASSETS.logo],
  },
};

/**
 * The address printed on the QR codes. Picks the language (saved choice → browser → ru) and keeps
 * `?table=12` and `#dish-<id>` from the old links.
 */
const redirect = `(function(){
var L=${JSON.stringify(routing.locales)},d=${JSON.stringify(routing.defaultLocale)},l=null;
try{l=localStorage.getItem("unipub-locale")}catch(e){}
if(L.indexOf(l)<0){var n=(navigator.languages&&navigator.languages[0])||navigator.language||"";l=n.slice(0,2).toLowerCase()}
if(L.indexOf(l)<0)l=d;
location.replace(${JSON.stringify(sitePath("/"))}+l+"/"+location.search+location.hash);
})();`;

export default function RootRedirect() {
  const fallback = sitePath(`/${routing.defaultLocale}`);
  return (
    <html lang="ru" data-theme="dark">
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: redirect }} />
        <noscript>
          <meta httpEquiv="refresh" content={`0;url=${fallback}`} />
        </noscript>
      </head>
      <body>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
          <p className="wordmark text-5xl">
            unipub
            <span className="wordmark-dot" aria-hidden="true" />
          </p>
          <a
            href={fallback}
            className="bg-accent text-on-accent mt-6 inline-flex min-h-12 items-center rounded-2xl px-6 font-bold no-underline"
          >
            Открыть меню
          </a>
        </main>
      </body>
    </html>
  );
}
