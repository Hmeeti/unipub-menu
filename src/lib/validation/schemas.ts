import { z } from "zod";
import { VENUE_TZ, parseHm, zonedParts } from "@/lib/domain/schedule";

export const MAX_ORDER_LINES = 40;
export const MAX_QTY = 30;
export const BOOKING_MAX_DAYS = 60;

const tableCode = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{1,8}$/, "table_code"));

const itemId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,47}$/i, "item_id");

/** Honeypot: must stay empty; bots tend to fill every field. */
const honeypot = z.string().max(0).optional().or(z.literal(""));

export const orderInputSchema = z.object({
  lines: z
    .array(z.object({ itemId, qty: z.int().min(1).max(MAX_QTY) }))
    .min(1)
    .max(MAX_ORDER_LINES)
    .refine((ls) => new Set(ls.map((l) => l.itemId)).size === ls.length, "duplicate_lines"),
  tableToken: z.string().max(64).optional(),
  tableCode: tableCode.optional(),
  waiterId: z.string().regex(/^[a-z0-9_-]{1,40}$/i),
  locale: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/)
    .default("ru"),
  comment: z.string().trim().max(300).optional(),
  confirmDuplicate: z.boolean().optional(),
  turnstileToken: z.string().max(4096).optional(),
  website: honeypot,
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export const PAYMENT_METHODS = ["cash", "card", "qr"] as const;

export const KZ_PHONE_RE = /^7\d{10}$/;
export function normalizeKzPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  if (d.length === 10) d = `7${d}`;
  return KZ_PHONE_RE.test(d) ? d : null;
}

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

export type BookingDateError = "booking_past" | "booking_too_far" | "booking_invalid";

/** Booking must be in the future (venue time) and no further than 60 days ahead. */
export function validateBookingDate(
  date: string,
  time: string,
  now: Date,
  tz: string = VENUE_TZ,
): BookingDateError | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "booking_invalid";
  const minutes = parseHm(time);
  if (minutes === null) return "booking_invalid";
  const asUtc = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(asUtc.getTime()) || asUtc.toISOString().slice(0, 10) !== date)
    return "booking_invalid";
  const today = zonedParts(now, tz);
  if (date < today.ymd || (date === today.ymd && minutes <= today.minutes)) return "booking_past";
  const limit = new Date(`${today.ymd}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + BOOKING_MAX_DAYS);
  if (date > limit.toISOString().slice(0, 10)) return "booking_too_far";
  return null;
}

const base = {
  tableToken: z.string().max(64).optional(),
  tableCode: tableCode.optional(),
  locale: z.string().max(10).default("ru"),
  turnstileToken: z.string().max(4096).optional(),
  website: honeypot,
};

export const requestInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("waiter"), ...base, waiterId: z.string().max(40).optional() }),
  z.object({
    type: z.literal("bill"),
    ...base,
    waiterId: z.string().max(40).optional(),
    payment: z.enum(PAYMENT_METHODS),
  }),
  z.object({
    type: z.literal("song"),
    ...base,
    artist: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(120),
    roomId: z.string().max(40).optional(),
    comment: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal("booking"),
    ...base,
    name: z.string().trim().min(2).max(60),
    phone: z
      .string()
      .max(32)
      .refine((v) => normalizeKzPhone(v) !== null, "phone"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    guests: z.int().min(1).max(50),
    roomId: z.string().max(40).optional(),
    comment: z.string().trim().max(200).optional(),
  }),
]);
export type RequestInput = z.infer<typeof requestInputSchema>;

export const reminderInputSchema = z.object({
  publicId: z.string().regex(/^[A-Za-z0-9_-]{16,40}$/),
});
