"use client";

import { Heart, Plus } from "lucide-react";
import { memo } from "react";
import { useT } from "@/components/providers/i18n-provider";
import { FLAG_ICONS } from "@/components/ui/icons";
import { Price } from "@/components/ui/price";
import { Stepper } from "@/components/ui/stepper";
import { MAX_QTY } from "@/lib/domain/limits";
import { formatPrice } from "@/lib/domain/money";
import type { ItemFlag } from "@/lib/domain/types";
import type { ItemView } from "@/lib/menu/view";
import { splitHighlight } from "@/lib/search/search";
import { useCart } from "@/lib/store/cart";
import { usePrefs, type ViewMode } from "@/lib/store/prefs";
import { cn } from "@/lib/utils";
import { ItemImage } from "./item-image";
import { useMenu } from "./menu-context";

const BADGE_FLAGS: ItemFlag[] = ["hit", "new", "spicy", "veg", "gf"];

export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {splitHighlight(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className="bg-pink/25 rounded-sm text-inherit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function AddControl({ item, size = "md" }: { item: ItemView; size?: "md" | "lg" }) {
  const t = useT();
  const { addToCart, soldOut } = useMenu();
  const qty = useCart((s) => s.lines.find((l) => l.id === item.id)?.qty ?? 0);
  const setQty = useCart((s) => s.setQty);
  if (soldOut.has(item.id)) return null;
  if (qty > 0) {
    return (
      <Stepper
        value={qty}
        max={MAX_QTY}
        onChange={(n) => setQty(item.id, n)}
        incLabel={t("item.increase", { name: item.name })}
        decLabel={t("item.decrease", { name: item.name })}
        size={size}
        className="relative z-10"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => addToCart(item.id, e.currentTarget)}
      aria-label={t("item.add", { name: item.name })}
      className={cn(
        "bg-accent text-on-accent relative z-10 grid shrink-0 place-items-center rounded-full shadow-[0_6px_20px_-6px_var(--pink)] transition-transform active:scale-90",
        size === "lg" ? "size-12" : "size-11",
      )}
    >
      <Plus className="size-5" strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}

export function FavoriteButton({
  item,
  className,
  tone = "photo",
}: {
  item: ItemView;
  className?: string;
  tone?: "photo" | "plain";
}) {
  const t = useT();
  const active = usePrefs((s) => s.favorites.includes(item.id));
  const toggle = usePrefs((s) => s.toggleFavorite);
  return (
    <button
      type="button"
      onClick={() => toggle(item.id)}
      aria-pressed={active}
      aria-label={t(active ? "item.favoriteRemove" : "item.favoriteAdd", { name: item.name })}
      className={cn("z-10 grid size-11 place-items-center rounded-full active:scale-90", className)}
    >
      <Heart
        className={cn(
          "size-5",
          active ? "fill-pink text-pink" : tone === "photo" ? "text-white" : "text-muted",
        )}
        aria-hidden="true"
        strokeWidth={2}
      />
    </button>
  );
}

function FlagBadges({ item }: { item: ItemView }) {
  const t = useT();
  const flags = BADGE_FLAGS.filter(
    (f) => item.flags.includes(f) || (f === "spicy" && item.spicyLevel > 0),
  );
  if (!flags.length) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {flags.slice(0, 3).map((f) => {
        const Icon = FLAG_ICONS[f];
        return (
          <li
            key={f}
            className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-xs font-semibold text-white"
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {t(`flags.${f}`)}
          </li>
        );
      })}
    </ul>
  );
}

type CardProps = { item: ItemView; view: ViewMode; query: string; priority?: boolean };

export const ItemCard = memo(function ItemCard({ item, view, query, priority }: CardProps) {
  const t = useT();
  const { openDish, soldOut, menu } = useMenu();
  const isSoldOut = soldOut.has(item.id);
  const icon = menu.categories.find((c) => c.id === item.categoryId)?.icon ?? "utensils";
  const open = () => openDish(item.id);

  const soldOutBadge = isSoldOut ? (
    <span className="border-line-strong bg-surface-2 text-muted rounded-full border px-2.5 py-1 text-[13px] font-semibold">
      {t("item.soldOut")}
    </span>
  ) : null;

  if (view === "list") {
    return (
      <article
        className={cn(
          "border-line bg-surface relative flex w-full gap-3 rounded-3xl border p-2.5",
          isSoldOut && "opacity-70",
        )}
        aria-label={item.name}
      >
        <div className="bg-surface-2 relative size-24 shrink-0 overflow-hidden rounded-2xl">
          <ItemImage
            image={item.images[0]}
            alt=""
            sizes="96px"
            icon={icon}
            priority={priority}
            muted={isSoldOut}
          />
        </div>
        <FavoriteButton item={item} tone="plain" className="absolute top-1 right-1" />
        <div className="flex min-w-0 flex-1 flex-col pr-9">
          <h3 className="text-base leading-snug font-bold">
            <button
              type="button"
              onClick={open}
              className="focus-visible:after:outline-pink text-left after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none focus-visible:after:outline-2"
            >
              <Highlight text={item.name} query={query} />
            </button>
          </h3>
          <p className="text-muted mt-0.5 line-clamp-2 text-sm leading-snug">
            <Highlight text={item.description} query={query} />
          </p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <div className="flex min-w-0 flex-col">
              <Price
                price={item.price}
                oldPrice={item.oldPrice}
                oldPriceLabel={
                  item.oldPrice
                    ? t("item.oldPrice", { price: formatPrice(item.oldPrice) })
                    : undefined
                }
                className="text-base"
              />
              {item.weight ? <span className="text-muted text-[13px]">{item.weight}</span> : null}
            </div>
            {soldOutBadge ?? <AddControl item={item} />}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "border-line bg-surface relative flex w-full flex-col overflow-hidden rounded-3xl border",
        isSoldOut && "opacity-70",
      )}
      aria-label={item.name}
    >
      <div className="bg-surface-2 relative aspect-[4/3] w-full overflow-hidden">
        <ItemImage
          image={item.images[0]}
          alt=""
          sizes="(min-width: 1024px) 280px, (min-width: 640px) 33vw, calc(50vw - 24px)"
          icon={icon}
          priority={priority}
          muted={isSoldOut}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start p-2 pr-12">
          <FlagBadges item={item} />
        </div>
        <FavoriteButton item={item} className="absolute top-1 right-1 bg-black/35" />
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-base leading-snug font-bold">
          <button
            type="button"
            onClick={open}
            className="focus-visible:after:outline-pink line-clamp-2 text-left after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none focus-visible:after:outline-2"
          >
            <Highlight text={item.name} query={query} />
          </button>
        </h3>
        {item.weight ? <p className="text-muted mt-0.5 text-[13px]">{item.weight}</p> : null}
        <p className="text-muted mt-1 line-clamp-2 text-sm leading-snug max-[359px]:hidden">
          <Highlight text={item.description} query={query} />
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
          <Price
            price={item.price}
            oldPrice={item.oldPrice}
            oldPriceLabel={
              item.oldPrice ? t("item.oldPrice", { price: formatPrice(item.oldPrice) }) : undefined
            }
            className="flex-col gap-0 text-base"
          />
          {soldOutBadge ?? <AddControl item={item} />}
        </div>
      </div>
    </article>
  );
});
