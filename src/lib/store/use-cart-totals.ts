"use client";

import { useMemo } from "react";
import { useMenu } from "@/components/menu/menu-context";
import { computeTotals } from "@/lib/domain/money";
import type { ItemView } from "@/lib/menu/view";
import { useCart } from "./cart";

export type PricedLine = { item: ItemView; qty: number; lineTotal: number; unavailable: boolean };

/** Display-only totals; the server recomputes everything from the database on submit. */
export function useCartTotals() {
  const { itemsById, soldOut, menu } = useMenu();
  const lines = useCart((s) => s.lines);
  return useMemo(() => {
    const priced: PricedLine[] = [];
    for (const l of lines) {
      const item = itemsById.get(l.id);
      if (!item) continue;
      const unavailable = soldOut.has(l.id);
      priced.push({
        item,
        qty: l.qty,
        lineTotal: unavailable ? 0 : item.price * l.qty,
        unavailable,
      });
    }
    const totals = computeTotals(
      priced.map((p) => p.lineTotal),
      menu.serviceRateBp,
    );
    const count = priced.reduce((s, p) => s + (p.unavailable ? 0 : p.qty), 0);
    return { lines: priced, totals, count };
  }, [lines, itemsById, soldOut, menu.serviceRateBp]);
}
