import { formatPrice } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

type Props = {
  price: number;
  oldPrice?: number | null;
  oldPriceLabel?: string;
  className?: string;
};

export function Price({ price, oldPrice, oldPriceLabel, className }: Props) {
  return (
    <span className={cn("inline-flex items-baseline gap-2 tabular-nums", className)}>
      <span className={cn("font-bold", oldPrice ? "text-pink-text" : "text-gold")}>
        {formatPrice(price)}
      </span>
      {oldPrice ? (
        <s className="text-muted text-[13px]" aria-label={oldPriceLabel}>
          {formatPrice(oldPrice)}
        </s>
      ) : null}
    </span>
  );
}
