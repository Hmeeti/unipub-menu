/** Shared by client UI and server validation; keep this module dependency-free (no zod). */
export const MAX_ORDER_LINES = 40;
export const MAX_QTY = 30;
export const BOOKING_MAX_DAYS = 60;
/** Table codes: Latin letters and digits, 1–8 chars, stored upper-case (12, VIP1, V2). */
export const TABLE_CODE_RE = /^[A-Z0-9]{1,8}$/;

export function normalizeTableCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  return TABLE_CODE_RE.test(v) ? v : null;
}
