import type { I18nList, I18nText, NativeLocale } from "@/lib/domain/types";

/** Localized DB text with Russian fallback (Russian is always filled). */
export function pick(text: I18nText | null | undefined, locale: NativeLocale): string {
  if (!text) return "";
  return text[locale]?.trim() || text.ru;
}

export function pickList(list: I18nList | null | undefined, locale: NativeLocale): string[] {
  if (!list) return [];
  const own = list[locale];
  return own && own.length ? own : list.ru;
}

export type Dict = Record<string, string>;

/** `{name}` interpolation for pre-resolved client strings (no ICU runtime on the client). */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function flattenMessages(
  messages: Record<string, unknown>,
  namespaces: readonly string[],
): Dict {
  const out: Dict = {};
  for (const ns of namespaces) {
    const group = messages[ns];
    if (!group || typeof group !== "object") continue;
    for (const [k, v] of Object.entries(group as Record<string, unknown>)) {
      if (typeof v === "string") out[`${ns}.${k}`] = v;
    }
  }
  return out;
}
