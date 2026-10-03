"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useT } from "@/components/providers/i18n-provider";
import { AllergenIcon } from "@/components/ui/allergen-icon";
import { FLAG_ICONS } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { ITEM_FLAGS, type ItemFlag } from "@/lib/domain/types";
import { EMPTY_FILTERS, SORT_MODES, type MenuFilters, type SortMode } from "@/lib/menu/filter";
import { cn } from "@/lib/utils";
import { useMenu } from "./menu-context";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: MenuFilters;
  onFilters: (f: MenuFilters) => void;
  countFor: (f: MenuFilters) => number;
};

const SORT_KEYS: Record<SortMode, string> = {
  default: "filters.sortDefault",
  price_asc: "filters.sortPriceAsc",
  price_desc: "filters.sortPriceDesc",
  hits: "filters.sortHits",
};

const toggle = <T,>(list: T[], v: T) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-semibold active:scale-95",
        pressed ? "border-pink bg-surface-2 text-pink-text" : "border-line bg-surface text-text",
      )}
    >
      {children}
    </button>
  );
}

export default function FilterSheet({ open, onOpenChange, filters, onFilters, countFor }: Props) {
  const t = useT();
  const { menu } = useMenu();
  const [draft, setDraft] = useState<MenuFilters>(filters);
  const usedAllergens = new Set(menu.items.flatMap((i) => i.allergens));
  const allergens = menu.allergens.filter((a) => usedAllergens.has(a.id));
  const usedFlags = ITEM_FLAGS.filter((f) =>
    menu.items.some((i) => i.flags.includes(f) || (f === "spicy" && i.spicyLevel > 0)),
  );
  const count = countFor(draft);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("filters.title")}
      closeLabel={t("common.close")}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FILTERS)}
            className="border-line-strong min-h-12 rounded-2xl border px-5 font-bold active:scale-95"
          >
            {t("filters.reset")}
          </button>
          <button
            type="button"
            onClick={() => {
              onFilters(draft);
              onOpenChange(false);
            }}
            className="bg-accent text-on-accent min-h-12 flex-1 rounded-2xl px-4 font-bold tabular-nums active:scale-[0.98]"
          >
            {t("filters.show", { count })}
          </button>
        </div>
      }
    >
      <fieldset className="mt-2">
        <legend className="text-gold mb-2 text-[13px] font-bold tracking-wide uppercase">
          {t("filters.flags")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {usedFlags.map((f: ItemFlag) => {
            const Icon = FLAG_ICONS[f];
            return (
              <Chip
                key={f}
                pressed={draft.flags.includes(f)}
                onClick={() => setDraft({ ...draft, flags: toggle(draft.flags, f) })}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(`flags.${f}`)}
              </Chip>
            );
          })}
        </div>
      </fieldset>

      {allergens.length ? (
        <fieldset className="mt-6">
          <legend className="text-gold mb-2 text-[13px] font-bold tracking-wide uppercase">
            {t("filters.excludeAllergens")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {allergens.map((a) => (
              <Chip
                key={a.id}
                pressed={draft.excludeAllergens.includes(a.id)}
                onClick={() =>
                  setDraft({ ...draft, excludeAllergens: toggle(draft.excludeAllergens, a.id) })
                }
              >
                <AllergenIcon name={a.icon} className="size-4" />
                {a.title}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="mt-6">
        <legend className="text-gold mb-2 text-[13px] font-bold tracking-wide uppercase">
          {t("filters.sort")}
        </legend>
        <div role="radiogroup" className="flex flex-col gap-1">
          {SORT_MODES.map((m) => {
            const checked = draft.sort === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setDraft({ ...draft, sort: m })}
                className={cn(
                  "active:bg-surface-2 flex min-h-12 items-center justify-between rounded-2xl px-4 text-left text-[15px]",
                  checked ? "bg-surface-2 font-bold" : "",
                )}
              >
                {t(SORT_KEYS[m])}
                {checked ? <Check className="text-pink-text size-5" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </fieldset>
    </Sheet>
  );
}
