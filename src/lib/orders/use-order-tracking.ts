"use client";

import { useEffect } from "react";
import { apiUrl } from "@/lib/site";
import { isTrackable, useOrders } from "@/lib/store/orders";
import { fetchOrderStatus } from "./client";
import type { OrderStatusView } from "./types";

const POLL_MS = 5000;
/** A buffering proxy can hold the stream open without delivering anything; fall back if so. */
const FIRST_EVENT_TIMEOUT_MS = 8000;

/** Keeps `useOrders.last` live: SSE first, polling when EventSource is missing or the stream is unusable. */
export function useOrderTracking() {
  const publicId = useOrders((s) => (isTrackable(s.last) ? s.last!.publicId : null));

  useEffect(() => {
    if (!publicId) return;
    const { update, dismiss } = useOrders.getState();
    let source: EventSource | null = null;
    let poll: number | undefined;
    let firstEvent: number | undefined;
    let stopped = false;

    const stopIfDone = () => {
      if (!isTrackable(useOrders.getState().last)) stop();
    };
    const apply = (order: OrderStatusView) => {
      update(order);
      stopIfDone();
    };
    const startPolling = () => {
      source?.close();
      source = null;
      if (stopped || poll !== undefined) return;
      const tick = async () => {
        if (document.visibilityState === "hidden") return;
        const res = await fetchOrderStatus(publicId);
        if (stopped) return;
        if (res.ok) apply(res.order);
        else if (res.error === "not_found") {
          dismiss();
          stop();
        }
      };
      void tick();
      poll = window.setInterval(() => void tick(), POLL_MS);
    };
    const stop = () => {
      stopped = true;
      source?.close();
      window.clearInterval(poll);
      window.clearTimeout(firstEvent);
    };

    if (typeof EventSource === "undefined") startPolling();
    else {
      source = new EventSource(apiUrl(`/api/orders/${encodeURIComponent(publicId)}/events`));
      firstEvent = window.setTimeout(startPolling, FIRST_EVENT_TIMEOUT_MS);
      source.addEventListener("status", (e) => {
        window.clearTimeout(firstEvent);
        try {
          apply(JSON.parse((e as MessageEvent<string>).data) as OrderStatusView);
        } catch {
          /* malformed frame; the next one or polling will correct it */
        }
      });
      source.onerror = () => {
        // CONNECTING = the browser retries by itself; CLOSED = HTTP error, switch to polling.
        if (source?.readyState === EventSource.CLOSED) startPolling();
      };
    }
    return stop;
  }, [publicId]);
}
