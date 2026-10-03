"use client";

import { Flame, Maximize2, Share2, X } from "lucide-react";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { useT } from "@/components/providers/i18n-provider";
import { AllergenIcon } from "@/components/ui/allergen-icon";
import { FLAG_ICONS } from "@/components/ui/icons";
import { Price } from "@/components/ui/price";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import { MAX_QTY } from "@/lib/domain/limits";
import type { ImageAsset } from "@/lib/domain/types";
import { formatPrice } from "@/lib/domain/money";
import { imageSrc } from "@/lib/images/loader";
import { hasFlag, pairingsFor } from "@/lib/menu/filter";
import { useCart } from "@/lib/store/cart";
import { flyToCart } from "@/lib/ui/fly-to-cart";
import { cn, vibrate } from "@/lib/utils";
import { FavoriteButton } from "./item-card";
import { ItemImage } from "./item-image";
import { useMenu } from "./menu-context";

type Props = {
  itemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDish: (id: string) => void;
};

export default function DishSheet({ itemId, open, onOpenChange, onOpenDish }: Props) {
  const t = useT();
  const { itemsById, soldOut, menu } = useMenu();
  const item = itemsById.get(itemId);
  const inCart = useCart((s) => s.lines.find((l) => l.id === itemId)?.qty ?? 0);
  const add = useCart((s) => s.add);
  const showToast = useToast((s) => s.show);
  const [qtyFor, setQtyFor] = useState({ id: itemId, qty: 1 });
  const qty = qtyFor.id === itemId ? qtyFor.qty : 1;
  const setQty = (n: number) => setQtyFor({ id: itemId, qty: n });
  if (!item) return null;
  const isSoldOut = soldOut.has(item.id);
  const category = menu.categories.find((c) => c.id === item.categoryId);
  const allergens = item.allergens
    .map((id) => menu.allergens.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const pairs = pairingsFor(item, menu.items, soldOut);
  const flags = item.flags.filter((f) => f !== "spicy");

  const share = async () => {
    const url = new URL(window.location.href);
    url.search = `?dish=${encodeURIComponent(item.id)}`;
    url.hash = "";
    try {
      if (navigator.share) await navigator.share({ title: item.name, url: url.toString() });
      else {
        await navigator.clipboard.writeText(url.toString());
        showToast({ message: t("item.linkCopied") });
      }
    } catch {
      /* user cancelled */
    }
  };

  const footer = isSoldOut ? (
    <p className="text-muted py-2 text-center font-semibold">{t("item.soldOut")}</p>
  ) : (
    <div className="flex items-center gap-3">
      <Stepper
        value={qty}
        max={MAX_QTY}
        onChange={(n) => setQty(Math.max(1, n))}
        incLabel={t("item.increase", { name: item.name })}
        decLabel={t("item.decrease", { name: item.name })}
        size="lg"
      />
      <button
        type="button"
        onClick={(e) => {
          add(item.id, qty);
          vibrate();
          flyToCart(e.currentTarget);
          onOpenChange(false);
        }}
        className="bg-accent text-on-accent min-h-12 flex-1 rounded-2xl px-4 text-base font-bold tabular-nums active:scale-[0.98]"
      >
        {t("item.toOrder", { price: formatPrice(item.price * qty) })}
      </button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={item.name}
      closeLabel={t("item.close")}
      footer={footer}
    >
      <div className="bg-surface-2 relative -mx-5 aspect-[4/3] overflow-hidden sm:mx-0 sm:rounded-3xl">
        <ItemImage
          image={item.images[0]}
          alt={item.name}
          sizes="(min-width: 640px) 576px, 100vw"
          icon={category?.icon ?? "utensils"}
          priority
          muted={isSoldOut}
        />
        {item.images[0] ? <PhotoViewer image={item.images[0]} name={item.name} /> : null}
        <FavoriteButton item={item} className="absolute top-2 right-2 bg-black/40" />
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Price
            price={item.price}
            oldPrice={item.oldPrice}
            oldPriceLabel={
              item.oldPrice ? t("item.oldPrice", { price: formatPrice(item.oldPrice) }) : undefined
            }
            className="text-xl"
          />
          <p className="text-muted flex flex-wrap gap-x-3 text-[13px]">
            {item.weight ? (
              <span>
                {t("item.weight")}: {item.weight}
              </span>
            ) : null}
            {item.cookTime ? (
              <span>
                {t("item.cookTime")}: {item.cookTime}
              </span>
            ) : null}
            {inCart ? (
              <span className="text-pink-text">{t("item.inCart", { count: inCart })}</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={share}
          aria-label={t("item.share")}
          className="border-line text-text grid size-11 shrink-0 place-items-center rounded-full border active:scale-90"
        >
          <Share2 className="size-5" aria-hidden="true" />
        </button>
      </div>

      {isSoldOut ? (
        <p className="border-line-strong bg-surface-2 text-muted mt-3 inline-block rounded-full border px-3 py-1 text-[13px] font-semibold">
          {t("item.soldOut")}
        </p>
      ) : null}

      {item.description ? (
        <p className="text-text mt-3 text-[15px] leading-relaxed">{item.description}</p>
      ) : null}

      {flags.length || hasFlag(item, "spicy") ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {flags.map((f) => {
            const Icon = FLAG_ICONS[f];
            return (
              <li
                key={f}
                className="border-line bg-surface-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold"
              >
                <Icon className="text-gold size-4" aria-hidden="true" />
                {t(`flags.${f}`)}
              </li>
            );
          })}
          {hasFlag(item, "spicy") ? (
            <li
              className="border-line bg-surface-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold"
              aria-label={`${t("item.spicy")}: ${Math.max(1, item.spicyLevel)}/3`}
            >
              {t("item.spicy")}
              <span className="flex" aria-hidden="true">
                {[1, 2, 3].map((n) => (
                  <Flame
                    key={n}
                    className={cn(
                      "size-4",
                      n <= Math.max(1, item.spicyLevel)
                        ? "fill-pink text-pink"
                        : "text-line-strong",
                    )}
                  />
                ))}
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {item.ingredients ? (
        <section className="mt-5">
          <h3 className="text-gold mb-1 text-[13px] font-bold tracking-wide uppercase">
            {t("item.ingredients")}
          </h3>
          <p className="text-muted text-[15px] leading-relaxed">{item.ingredients}</p>
        </section>
      ) : null}

      <section className="mt-5">
        <h3 className="text-gold mb-2 text-[13px] font-bold tracking-wide uppercase">
          {t("item.allergens")}
        </h3>
        {allergens.length ? (
          <ul className="flex flex-wrap gap-2">
            {allergens.map((a) => (
              <li
                key={a.id}
                className="border-line inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px]"
              >
                <AllergenIcon name={a.icon} className="text-gold-dim size-4" />
                {a.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-[14px]">{t("item.noAllergens")}</p>
        )}
      </section>

      {pairs.length ? (
        <section className="mt-6">
          <h3 className="mb-2 text-base font-bold">{t("item.pairWith")}</h3>
          <ul className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
            {pairs.map((p) => (
              <li key={p.id} className="w-36 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenDish(p.id)}
                  className="border-line bg-surface-2 flex w-full flex-col overflow-hidden rounded-2xl border text-left active:scale-[0.98]"
                  aria-label={t("item.details", { name: p.name })}
                >
                  <span className="relative aspect-[4/3] w-full">
                    <ItemImage
                      image={p.images[0]}
                      alt=""
                      sizes="144px"
                      icon={menu.categories.find((c) => c.id === p.categoryId)?.icon ?? "utensils"}
                    />
                  </span>
                  <span className="line-clamp-2 px-2.5 pt-2 text-[14px] leading-snug font-semibold">
                    {p.name}
                  </span>
                  <span className="text-gold px-2.5 pt-1 pb-2.5 text-[14px] font-bold tabular-nums">
                    {formatPrice(p.price)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Sheet>
  );
}

function PhotoViewer({ image, name }: { image: ImageAsset; name: string }) {
  const t = useT();
  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label={t("item.openPhoto")}
        className="absolute right-2 bottom-2 grid size-11 place-items-center rounded-full bg-black/55 text-white active:scale-90"
      >
        <Maximize2 className="size-5" aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-[70] bg-black/90" />
        <Dialog.Content
          className="fixed inset-0 z-[70] flex items-center justify-center outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{name}</Dialog.Title>
          <div className="relative size-full">
            <Image src={imageSrc(image)} alt={name} fill sizes="100vw" className="object-contain" />
          </div>
          <Dialog.Close
            aria-label={t("common.close")}
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 grid size-12 place-items-center rounded-full bg-white/15 text-white active:scale-90"
          >
            <X className="size-6" aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
