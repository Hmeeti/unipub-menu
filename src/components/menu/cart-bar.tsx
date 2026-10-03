"use client";

import { ShoppingBag } from "lucide-react";
import { useT } from "@/components/providers/i18n-provider";
import { formatPrice } from "@/lib/domain/money";
import { useCartTotals } from "@/lib/store/use-cart-totals";
import { CART_TARGET_ID } from "@/lib/ui/fly-to-cart";

export function CartBar({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const { count, totals } = useCartTotals();
  if (!count) return null;
  const total = formatPrice(totals.total);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button
        id={CART_TARGET_ID}
        type="button"
        onClick={onOpen}
        aria-label={t("cart.open", { count, total })}
        className="pop-in bg-accent text-on-accent pointer-events-auto mx-auto flex min-h-14 w-full max-w-xl items-center gap-3 rounded-2xl px-4 text-left shadow-[0_12px_32px_-10px_var(--pink)] active:scale-[0.98]"
      >
        <ShoppingBag className="size-5 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-base font-bold tabular-nums">
          {t("cart.bar", { count, total })}
        </span>
      </button>
    </div>
  );
}
