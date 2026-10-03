import { apiCall, type TransportError } from "@/lib/orders/client";
import type { RequestErrorBody, RequestOkBody } from "./types";

export type RequestPayloadInput = Record<string, unknown> & { type: string; locale: string };
export type RequestClientResult = RequestOkBody | RequestErrorBody | TransportError;

export function submitRequest(
  payload: RequestPayloadInput,
  idempotencyKey: string,
): Promise<RequestClientResult> {
  return apiCall("/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(payload),
  });
}

export function fetchRequestStatus(publicId: string): Promise<RequestClientResult> {
  return apiCall(`/api/requests/${encodeURIComponent(publicId)}`, { method: "GET" });
}
