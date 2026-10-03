/** Shared between the API and the guest UI; must stay free of server imports. */

export const ANY_WAITER = "any";

/** Guest-facing status: `queued` = waiting for Telegram delivery, `sent` = staff notified. */
export type GuestOrderStatus = "queued" | "sent" | "accepted" | "failed";

export type OrderStatusView = {
  publicId: string;
  number: number;
  status: GuestOrderStatus;
  acceptedBy: string | null;
  /** names of dishes staff marked as unavailable, in the guest's language */
  unavailable: string[];
  total: number;
  createdAt: string;
  /** when the one-time "remind" button becomes available; null once used or not applicable */
  remindAt: string | null;
};

export type OrderErrorCode =
  | "invalid"
  | "origin"
  | "orders_disabled"
  | "closed"
  | "table_required"
  | "table_unknown"
  | "table_token_invalid"
  | "waiter_unknown"
  | "unavailable"
  | "duplicate"
  | "rate_limited"
  | "captcha_required"
  | "captcha_failed"
  | "in_progress"
  | "remind_not_allowed"
  | "not_found"
  | "server";

export type OrderErrorBody = {
  ok: false;
  error: OrderErrorCode;
  retryAfterSec?: number;
  unavailable?: string[];
  duplicateOf?: number;
  siteKey?: string;
};

export type OrderOkBody = { ok: true; order: OrderStatusView };

export const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{16,40}$/;
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9-]{16,64}$/;
export const REMIND_AFTER_MS = 3 * 60 * 1000;
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
