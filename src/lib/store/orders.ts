"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { OrderStatusView } from "@/lib/orders/types";
import { CART_TTL_MS } from "./cart";

/** Live updates stop after this; the pill stays until the TTL so the guest can still see the number. */
export const TRACK_WINDOW_MS = 3 * 60 * 60 * 1000;

type OrdersState = {
  last: OrderStatusView | null;
  setLast: (order: OrderStatusView) => void;
  /** ignores updates for other orders (a stale stream can outlive a newer submit) */
  update: (order: OrderStatusView) => void;
  dismiss: () => void;
};

export const useOrders = create<OrdersState>()(
  persist(
    (set, get) => ({
      last: null,
      setLast: (last) => set({ last }),
      update: (order) => {
        if (get().last?.publicId === order.publicId) set({ last: order });
      },
      dismiss: () => set({ last: null }),
    }),
    {
      name: "unipub:orders",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ last }) => ({ last }),
      merge: (persisted, current) => {
        const last = (persisted as Partial<OrdersState> | undefined)?.last;
        if (!last || Date.now() - Date.parse(last.createdAt) > CART_TTL_MS) return current;
        return { ...current, last };
      },
    },
  ),
);

export function isTrackable(order: OrderStatusView | null, now = Date.now()): boolean {
  return (
    !!order && order.status !== "failed" && now - Date.parse(order.createdAt) < TRACK_WINDOW_MS
  );
}
