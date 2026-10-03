"use client";

import { ReceiptText, ShoppingBag } from "lucide-react";
import { useT } from "@/components/providers/i18n-provider";
import { formatPrice } from "@/lib/domain/money";
import type { OrderStatusView } from "@/lib/orders/types";
import { useOrders } from "@/lib/store/orders";
import { useCartTotals } from "@/lib/store/use-cart-totals";
import { CART_TARGET_ID } from "@/lib/ui/fly-to-cart";
import { cn } from "@/lib/utils";

function statusLabel(order: OrderStatusView, t: ReturnType<typeof useT>): string {
  if (order.status === "accepted") return t("order.stepAccepted");
  if (order.status === "failed") return t("order.pillFailed");
  return t("order.stepSent");
}

export function CartBar({ onOpen, onOpenOrder }: { onOpen: () => void; onOpenOrder: () => void }) {
  const t = useT();
  const { count, totals } = useCartTotals();
  const order = useOrders((s) => s.last);
  if (!count && !order) return null;
  const total = formatPrice(totals.total);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {order ? (
        <button
          type="button"
          onClick={onOpenOrder}
          aria-haspopup="dialog"
          className={cn(
            "pop-in bg-surface border-line-strong pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[14px] font-bold shadow-lg active:scale-95",
            order.status === "failed" && "border-danger text-danger",
          )}
        >
          <ReceiptText className="size-4 shrink-0" aria-hidden="true" />
          {t("order.pill", { number: order.number, status: statusLabel(order, t) })}
        </button>
      ) : null}
      {count ? (
        <button
          id={CART_TARGET_ID}
          type="button"
          onClick={onOpen}
          aria-label={t("cart.open", { count, total })}
          className="pop-in bg-accent text-on-accent pointer-events-auto flex min-h-14 w-full max-w-xl items-center gap-3 rounded-2xl px-4 text-left shadow-[0_12px_32px_-10px_var(--pink)] active:scale-[0.98]"
        >
          <ShoppingBag className="size-5 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-base font-bold tabular-nums">
            {t("cart.bar", { count, total })}
          </span>
        </button>
      ) : null}
    </div>
  );
}
