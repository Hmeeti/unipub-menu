/** Kazakhstan mobile numbers, stored/compared as 11 digits starting with 7. Client-safe (no zod). */
export const KZ_PHONE_RE = /^7\d{10}$/;

export function normalizeKzPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  if (d.length === 10) d = `7${d}`;
  return KZ_PHONE_RE.test(d) ? d : null;
}

/** Progressive "+7 (7xx) xxx-xx-xx" mask; safe to call on every keystroke. */
export function formatKzPhone(digits: string): string {
  const d = digits.replace(/\D/g, "").replace(/^8/, "7").slice(0, 11);
  const rest = d.startsWith("7") ? d.slice(1) : d;
  const p = [rest.slice(0, 3), rest.slice(3, 6), rest.slice(6, 8), rest.slice(8, 10)];
  let out = "+7";
  if (p[0]) out += ` (${p[0]}`;
  if (p[0] && p[0].length === 3) out += ")";
  if (p[1]) out += ` ${p[1]}`;
  if (p[2]) out += `-${p[2]}`;
  if (p[3]) out += `-${p[3]}`;
  return out;
}
