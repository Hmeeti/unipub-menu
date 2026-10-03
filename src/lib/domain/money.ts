export const NBSP = "\u00A0";

/** "3900" → "3 900 ₸" with non-breaking spaces (thousands groups and before the currency sign). */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return `—${NBSP}₸`;
  const sign = value < 0 ? "−" : "";
  const digits = String(Math.round(Math.abs(value)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${sign}${grouped}${NBSP}₸`;
}

export function serviceFor(subtotal: number, serviceRateBp: number): number {
  return Math.round((subtotal * serviceRateBp) / 10000);
}

export type Totals = { subtotal: number; service: number; total: number };

export function computeTotals(lineTotals: number[], serviceRateBp: number): Totals {
  const subtotal = lineTotals.reduce((s, v) => s + v, 0);
  const service = serviceFor(subtotal, serviceRateBp);
  return { subtotal, service, total: subtotal + service };
}

export function percentLabel(serviceRateBp: number): string {
  const pct = serviceRateBp / 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}
