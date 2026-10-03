"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import Image from "next/image";
import { useT } from "@/components/providers/i18n-provider";
import { imageSrc } from "@/lib/images/loader";
import type { PromoView } from "@/lib/menu/view";
import { useMenu } from "./menu-context";

export function PromoStrip({ promos }: { promos: PromoView[] }) {
  const t = useT();
  const { openDish, itemsById } = useMenu();
  if (!promos.length) return null;
  return (
    <section aria-label={t("promo.label")} className="mx-auto w-full max-w-6xl px-4 pb-2">
      <ul className="no-scrollbar flex snap-x gap-3 overflow-x-auto">
        {promos.map((p) => {
          const dish = p.itemId ? itemsById.get(p.itemId) : undefined;
          const image = p.image ?? dish?.images[0] ?? null;
          const content = (
            <>
              {image ? (
                <span className="bg-surface-2 relative size-16 shrink-0 overflow-hidden rounded-2xl">
                  <Image src={imageSrc(image)} alt="" fill sizes="64px" className="object-cover" />
                </span>
              ) : (
                <Sparkles className="text-gold size-6 shrink-0" aria-hidden="true" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-pink-text text-[13px] font-semibold tracking-wide uppercase">
                  {p.kind === "dish_of_day" ? t("promo.dishOfDay") : p.title}
                </span>
                <span className="line-clamp-2 text-[15px] leading-snug font-semibold">
                  {p.kind === "dish_of_day" ? (dish?.name ?? p.title) : p.body}
                </span>
              </span>
              {dish || p.link ? (
                <ChevronRight className="text-muted size-5 shrink-0" aria-hidden="true" />
              ) : null}
            </>
          );
          const cls =
            "flex min-h-20 w-[85vw] max-w-sm snap-start items-center gap-3 rounded-3xl border border-line bg-surface p-3 text-left text-text no-underline";
          return (
            <li key={p.id} className="shrink-0">
              {dish ? (
                <button
                  type="button"
                  className={`${cls} active:scale-[0.99]`}
                  onClick={() => openDish(dish.id)}
                >
                  {content}
                </button>
              ) : p.link ? (
                <a className={cls} href={p.link} target="_blank" rel="noopener noreferrer">
                  {content}
                </a>
              ) : (
                <div className={cls}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
