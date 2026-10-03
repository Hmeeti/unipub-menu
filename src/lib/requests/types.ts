/** Shared between the API and the guest UI; must stay free of server imports. */
import type { GuestOrderStatus } from "@/lib/orders/types";

export const REQUEST_TYPES = ["waiter", "bill", "song", "booking"] as const;
export type GuestRequestType = (typeof REQUEST_TYPES)[number];

export const PAYMENT_METHODS = ["cash", "card", "qr"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type RequestStatusView = {
  publicId: string;
  number: number;
  type: GuestRequestType;
  status: GuestOrderStatus;
  acceptedBy: string | null;
  createdAt: string;
};

export type RequestErrorCode =
  | "invalid"
  | "origin"
  | "feature_off"
  | "closed"
  | "table_required"
  | "table_unknown"
  | "table_token_invalid"
  | "waiter_unknown"
  | "room_unknown"
  | "booking_past"
  | "booking_too_far"
  | "booking_invalid"
  | "rate_limited"
  | "captcha_required"
  | "captcha_failed"
  | "in_progress"
  | "delivery_failed"
  | "not_found"
  | "server";

export type RequestErrorBody = {
  ok: false;
  error: RequestErrorCode;
  retryAfterSec?: number;
  siteKey?: string;
};

export type RequestOkBody = { ok: true; request: RequestStatusView };
