import type { NativeLocale } from "@/lib/domain/types";
import type { OrderErrorBody, OrderErrorCode, OrderOkBody } from "./types";

export type OrderPayload = {
  lines: { itemId: string; qty: number }[];
  tableToken?: string;
  tableCode?: string;
  waiterId: string;
  locale: NativeLocale;
  comment?: string;
  split?: { people: { id: string; name: string }[]; assign: Record<string, string> };
  confirmDuplicate?: boolean;
  turnstileToken?: string;
};

export type ClientErrorCode = OrderErrorCode | "network";
export type ClientResult =
  OrderOkBody | (Omit<OrderErrorBody, "error"> & { error: ClientErrorCode });

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export type TransportError = { ok: false; error: "network" | "server" };

/** API responses are always `{ ok, ... }` JSON; anything else is reported as a server error. */
export async function apiCall<T extends { ok: boolean }>(
  url: string,
  init: RequestInit,
): Promise<T | TransportError> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  } catch {
    return { ok: false, error: "network" };
  }
  const body = (await res.json().catch(() => null)) as T | null;
  if (!body || typeof body.ok !== "boolean") return { ok: false, error: "server" };
  return body;
}

const call = (url: string, init: RequestInit) => apiCall<ClientResult>(url, init);

/** The same key must be reused when retrying the same cart: the server then replays instead of duplicating. */
export function submitOrder(payload: OrderPayload, idempotencyKey: string): Promise<ClientResult> {
  return call("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(payload),
  });
}

export function fetchOrderStatus(publicId: string): Promise<ClientResult> {
  return call(`/api/orders/${encodeURIComponent(publicId)}`, { method: "GET" });
}

export function remindOrder(publicId: string): Promise<ClientResult> {
  return call(`/api/orders/${encodeURIComponent(publicId)}/remind`, { method: "POST" });
}
