"use client";

import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useT } from "@/components/providers/i18n-provider";
import { activeFilterCount, type MenuFilters } from "@/lib/menu/filter";
import { usePrefs, type ViewMode } from "@/lib/store/prefs";
import { cn } from "@/lib/utils";
import { useMenu } from "./menu-context";

type Props = {
  query: string;
  onQuery: (q: string) => void;
  filters: MenuFilters;
  onFilters: (f: MenuFilters) => void;
  onOpenFilters: () => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  found: number | null;
};

export function Toolbar({
  query,
  onQuery,
  filters,
  onFilters,
  onOpenFilters,
  view,
  onView,
  found,
}: Props) {
  const t = useT();
  const { menu } = useMenu();
  const inputId = useId();
  const suggestId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const recent = usePrefs((s) => s.recentSearches);
  const pushSearch = usePrefs((s) => s.pushSearch);
  const count = activeFilterCount(filters);
  const allergenTitle = new Map(menu.allergens.map((a) => [a.id, a.title]));

  const chips: Array<{ key: string; label: string; remove: () => void }> = [
    ...filters.flags.map((f) => ({
      key: `f-${f}`,
      label: t(`flags.${f}`),
      remove: () => onFilters({ ...filters, flags: filters.flags.filter((x) => x !== f) }),
    })),
    ...filters.excludeAllergens.map((a) => ({
      key: `a-${a}`,
      label: t("filters.without", { label: allergenTitle.get(a) ?? a }),
      remove: () =>
        onFilters({
          ...filters,
          excludeAllergens: filters.excludeAllergens.filter((x) => x !== a),
        }),
    })),
    ...(filters.sort !== "default"
      ? [
          {
            key: "sort",
            label: t(
              {
                price_asc: "filters.sortPriceAsc",
                price_desc: "filters.sortPriceDesc",
                hits: "filters.sortHits",
              }[filters.sort],
            ),
            remove: () => onFilters({ ...filters, sort: "default" as const }),
          },
        ]
      : []),
  ];

  const showSuggest = focused && !query && (recent.length > 0 || menu.popularQueries.length > 0);
  const pick = (q: string) => {
    onQuery(q);
    pushSearch(q);
    inputRef.current?.blur();
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-3 pb-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">
            {t("search.label")}
          </label>
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
            value={query}
            placeholder={t("search.placeholder")}
            aria-describedby={showSuggest ? suggestId : undefined}
            onChange={(e) => onQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              if (query.trim() && found) pushSearch(query);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (query.trim()) pushSearch(query);
                e.currentTarget.blur();
              }
              if (e.key === "Escape") onQuery("");
            }}
            className="border-line bg-surface text-text placeholder:text-muted focus:border-pink h-12 w-full rounded-2xl border pr-11 pl-11 text-base focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                onQuery("");
                inputRef.current?.focus();
              }}
              aria-label={t("search.clear")}
              className="text-muted absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center rounded-xl active:scale-95"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          ) : null}
          {showSuggest ? (
            <div
              id={suggestId}
              className="border-line-strong bg-surface shadow-sheet absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border p-3"
              onPointerDown={(e) => e.preventDefault()}
            >
              {recent.length ? (
                <SuggestGroup title={t("search.recent")} items={recent} onPick={pick} />
              ) : null}
              {menu.popularQueries.length ? (
                <SuggestGroup
                  title={t("search.popular")}
                  items={menu.popularQueries}
                  onPick={pick}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onOpenFilters}
          aria-label={count ? t("filters.openWithCount", { count }) : t("filters.open")}
          className={cn(
            "relative grid size-12 shrink-0 place-items-center rounded-2xl border active:scale-95",
            count ? "border-pink bg-surface text-pink-text" : "border-line bg-surface text-text",
          )}
        >
          <SlidersHorizontal className="size-5" aria-hidden="true" />
          {count ? (
            <span
              className="bg-accent text-on-accent absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full px-1 text-xs leading-5 font-bold tabular-nums"
              aria-hidden="true"
            >
              {count}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onView(view === "grid" ? "list" : "grid")}
          aria-label={`${t("view.label")}: ${t(view === "grid" ? "view.list" : "view.grid")}`}
          className="border-line bg-surface text-text grid size-12 shrink-0 place-items-center rounded-2xl border active:scale-95"
        >
          {view === "grid" ? (
            <List className="size-5" aria-hidden="true" />
          ) : (
            <LayoutGrid className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
      {chips.length || found !== null ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {found !== null ? (
            <span className="text-muted text-[13px]" aria-live="polite">
              {t("search.found", { count: found })}
            </span>
          ) : null}
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.remove}
              aria-label={t("filters.removeChip", { label: c.label })}
              className="border-line-strong bg-surface-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border py-1 pr-2 pl-3 text-[13px] font-semibold active:scale-95"
            >
              {c.label}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
          {chips.length ? (
            <button
              type="button"
              onClick={() => onFilters({ flags: [], excludeAllergens: [], sort: "default" })}
              className="text-link min-h-11 px-2 text-[13px] font-semibold underline-offset-4 hover:underline"
            >
              {t("filters.reset")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SuggestGroup({
  title,
  items,
  onPick,
}: {
  title: string;
  items: string[];
  onPick: (q: string) => void;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-muted mb-1.5 text-[13px] font-semibold">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="border-line bg-surface-2 min-h-11 rounded-full border px-3 text-[14px] active:scale-95"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
