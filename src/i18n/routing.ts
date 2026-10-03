import { defineRouting } from "next-intl/routing";
import { NATIVE_LOCALES } from "@/lib/domain/types";

export const routing = defineRouting({
  locales: NATIVE_LOCALES,
  defaultLocale: "ru",
  localePrefix: "always",
  localeCookie: { name: "NEXT_LOCALE", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" },
});

export type AppLocale = (typeof routing.locales)[number];
