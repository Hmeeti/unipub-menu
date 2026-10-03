import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { NonceProvider } from "@/components/providers/nonce-provider";
import { Toaster } from "@/components/ui/toast";
import { manrope, syne } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "Админка · UNIPUB", template: "%s · Админка UNIPUB" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050508",
};

/** Staff tool: Russian only, brand dark theme, no guest scripts (splash, theme switch). */
export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="ru" data-theme="dark" className={`${manrope.variable} ${syne.variable}`}>
      <body>
        <NonceProvider nonce={nonce} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
