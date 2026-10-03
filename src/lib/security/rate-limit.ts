import type { Kv } from "@/lib/kv/kv";

export type LimitRule = { key: string; limit: number; windowMs: number; name: string };
export type LimitResult = { ok: true } | { ok: false; rule: string; retryAfterMs: number };

/**
 * Fixed-window counters in Redis. All rules are counted (so a burst is visible on every axis)
 * and the first exceeded rule is reported. Windows are short on purpose: the whole bar shares
 * one Wi-Fi IP, so nobody gets locked out for hours.
 */
export async function checkLimits(kv: Kv, rules: LimitRule[]): Promise<LimitResult> {
  let failed: { rule: string; retryAfterMs: number } | null = null;
  for (const r of rules) {
    const { count, ttlMs } = await kv.incr(`rl:${r.key}`, r.windowMs);
    if (count > r.limit && !failed) failed = { rule: r.name, retryAfterMs: ttlMs };
  }
  return failed ? { ok: false, ...failed } : { ok: true };
}

/** Read-only probe used to decide whether to demand a captcha. */
export async function peekCount(kv: Kv, key: string): Promise<number> {
  const v = await kv.get(`rl:${key}`);
  return v ? Number(v) : 0;
}

const MIN = 60_000;

export const ORDER_LIMITS = {
  verified: (ids: { table: string; session: string; ip: string }): LimitRule[] => [
    { name: "table", key: `order:t:${ids.table}`, limit: 8, windowMs: 10 * MIN },
    { name: "session", key: `order:s:${ids.session}`, limit: 6, windowMs: 10 * MIN },
    { name: "ip", key: `order:ip:${ids.ip}`, limit: 80, windowMs: 10 * MIN },
  ],
  unverified: (ids: { table: string; session: string; ip: string }): LimitRule[] => [
    { name: "table", key: `order:ut:${ids.table}`, limit: 3, windowMs: 15 * MIN },
    { name: "session", key: `order:us:${ids.session}`, limit: 2, windowMs: 15 * MIN },
    { name: "ip", key: `order:uip:${ids.ip}`, limit: 20, windowMs: 15 * MIN },
  ],
};

export const REQUEST_LIMITS = (
  type: string,
  ids: { table: string; session: string; ip: string },
): LimitRule[] => {
  const perSession = type === "booking" ? 3 : type === "song" ? 6 : 4;
  return [
    { name: "session", key: `req:${type}:s:${ids.session}`, limit: perSession, windowMs: 15 * MIN },
    { name: "table", key: `req:${type}:t:${ids.table}`, limit: perSession + 2, windowMs: 15 * MIN },
    { name: "ip", key: `req:ip:${ids.ip}`, limit: 60, windowMs: 10 * MIN },
  ];
};

export const LOGIN_LIMITS = (ids: { login: string; ip: string }): LimitRule[] => [
  { name: "login", key: `login:u:${ids.login}`, limit: 5, windowMs: 15 * MIN },
  { name: "ip", key: `login:ip:${ids.ip}`, limit: 20, windowMs: 15 * MIN },
];

/** Soft IP threshold after which Turnstile is required (when configured). */
export const CAPTCHA_IP_THRESHOLD = 30;
