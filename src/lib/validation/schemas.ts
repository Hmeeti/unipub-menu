import { z } from "zod";
import { BOOKING_MAX_DAYS, MAX_ORDER_LINES, MAX_QTY, TABLE_CODE_RE } from "@/lib/domain/limits";
import { VENUE_TZ, parseHm, zonedParts } from "@/lib/domain/schedule";
import { KZ_PHONE_RE, formatKzPhone, normalizeKzPhone } from "@/lib/domain/phone";
import { MAX_SPLIT_PEOPLE } from "@/lib/domain/split";
import { PAYMENT_METHODS } from "@/lib/requests/types";

export { BOOKING_MAX_DAYS, MAX_ORDER_LINES, MAX_QTY };

const tableCode = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(TABLE_CODE_RE, "table_code"));

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
  split: z
    .object({
      people: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9]{1,24}$/i),
            name: z.string().trim().min(1).max(24),
          }),
        )
        .min(2)
        .max(MAX_SPLIT_PEOPLE),
      assign: z.record(z.string().max(48), z.string().max(24)),
    })
    .optional(),
  confirmDuplicate: z.boolean().optional(),
  turnstileToken: z.string().max(4096).optional(),
  website: honeypot,
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export { PAYMENT_METHODS };
export { KZ_PHONE_RE, formatKzPhone, normalizeKzPhone };

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
