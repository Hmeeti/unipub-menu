import { computeTotals, type Totals } from "@/lib/domain/money";
import { effectivePrice } from "@/lib/domain/pricing";
import { calcSplit, type SplitPart, type SplitPerson } from "@/lib/domain/split";
import {
  NATIVE_LOCALES,
  type NativeLocale,
  type OrderLine,
  type PublicItem,
} from "@/lib/domain/types";
import { pick } from "@/lib/i18n/text";

export type PriceInput = { itemId: string; qty: number };

export type PriceResult =
  { ok: true; lines: OrderLine[]; totals: Totals } | { ok: false; unavailable: string[] };

/**
 * Recomputes the order from the published menu. Only ids and quantities come from the client;
 * names, unit prices (sale price only while its schedule is active) and totals are ours.
 */
export function priceOrder(
  input: PriceInput[],
  items: ReadonlyMap<string, PublicItem>,
  soldOut: ReadonlySet<string>,
  opts: { now: Date; tz: string; locale: string; serviceRateBp: number },
): PriceResult {
  const unavailable = input
    .filter((l) => !items.has(l.itemId) || soldOut.has(l.itemId))
    .map((l) => l.itemId);
  if (unavailable.length) return { ok: false, unavailable };

  const locale: NativeLocale = (NATIVE_LOCALES as readonly string[]).includes(opts.locale)
    ? (opts.locale as NativeLocale)
    : "ru";
  const lines: OrderLine[] = input.map(({ itemId, qty }) => {
    const item = items.get(itemId)!;
    const unitPrice = effectivePrice(item, opts.now, opts.tz);
    return {
      itemId,
      nameRu: item.name.ru,
      nameGuest: pick(item.name, locale),
      qty,
      unitPrice,
      basePrice: item.price,
      lineTotal: unitPrice * qty,
    };
  });
  const totals = computeTotals(
    lines.map((l) => l.lineTotal),
    opts.serviceRateBp,
  );
  return { ok: true, lines, totals };
}

export type SplitInput = { people: SplitPerson[]; assign: Record<string, string> };

/** Per-person bill with server prices; client-side assignment only decides who pays for what. */
export function splitOrder(
  split: SplitInput | undefined,
  lines: OrderLine[],
  totals: Totals,
  serviceRateBp: number,
): SplitPart[] | null {
  if (!split || split.people.length < 2) return null;
  return calcSplit(
    lines.map((l) => ({ itemId: l.itemId, lineTotal: l.lineTotal })),
    split.people,
    split.assign,
    serviceRateBp,
    totals.total,
  );
}
