"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { NativeLocale } from "@/lib/domain/types";
import { format, type Dict } from "@/lib/i18n/text";

type Ctx = { locale: NativeLocale; dict: Dict };

const I18nContext = createContext<Ctx>({ locale: "ru", dict: {} });

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: NativeLocale;
  dict: Dict;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): NativeLocale {
  return useContext(I18nContext).locale;
}

export function useT() {
  const { dict } = useContext(I18nContext);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => format(dict[key] ?? key, vars),
    [dict],
  );
}
