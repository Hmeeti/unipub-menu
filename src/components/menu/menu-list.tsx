"use client";

import { SearchX } from "lucide-react";
import { useT } from "@/components/providers/i18n-provider";
import { CategoryIcon } from "@/components/ui/icons";
import type { FilterResult } from "@/lib/menu/filter";
import type { ItemView } from "@/lib/menu/view";
import { usePrefs, type ViewMode } from "@/lib/store/prefs";
import { cn } from "@/lib/utils";
import { FAVORITES_SECTION, sectionId } from "./category-nav";
import { ItemCard } from "./item-card";
import { useMenu } from "./menu-context";

const PRIORITY_COUNT = 4;

/** Mobile-sized placeholder height for off-screen sections (content-visibility: auto). */
function estimateHeight(count: number, view: ViewMode): number {
  const body = view === "grid" ? Math.ceil(count / 2) * 312 : count * 132;
  return 40 + body;
}

type Props = {
  result: FilterResult;
  view: ViewMode;
  query: string;
  filtersActive: boolean;
  onReset: () => void;
  onPickQuery: (q: string) => void;
};

function Grid({
  items,
  view,
  query,
  priorityFrom,
}: {
  items: ItemView[];
  view: ViewMode;
  query: string;
  priorityFrom?: number;
}) {
  return (
    <ul
      className={cn(
        "grid gap-3",
        view === "grid"
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
          : "grid-cols-1 md:grid-cols-2",
      )}
    >
      {items.map((it, i) => (
        <li key={it.id} className="flex">
          <ItemCard
            item={it}
            view={view}
            query={query}
            priority={priorityFrom !== undefined && priorityFrom + i < PRIORITY_COUNT}
          />
        </li>
      ))}
    </ul>
  );
}

export function MenuList({ result, view, query, filtersActive, onReset, onPickQuery }: Props) {
  const t = useT();
  const { menu, itemsById } = useMenu();
  const favorites = usePrefs((s) => s.favorites);

  if (!result.items.length) {
    return (
      <div className="flex flex-col items-center px-4 py-14 text-center">
        <SearchX className="text-gold-dim mb-3 size-10" aria-hidden="true" />
        <p className="text-muted max-w-sm text-[15px]">{t("search.empty")}</p>
        {menu.popularQueries.length ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {menu.popularQueries.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onPickQuery(q)}
                className="border-line bg-surface min-h-11 rounded-full border px-4 text-[15px] active:scale-95"
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}
        {query || filtersActive ? (
          <button
            type="button"
            onClick={onReset}
            className="bg-accent text-on-accent mt-5 min-h-11 rounded-full px-5 font-bold active:scale-95"
          >
            {t("search.resetFilters")}
          </button>
        ) : null}
      </div>
    );
  }

  if (!result.grouped) {
    return (
      <div className="pt-2">
        <Grid items={result.items} view={view} query={query} priorityFrom={0} />
      </div>
    );
  }

  const visible = new Set(result.items.map((i) => i.id));
  const favItems = filtersActive
    ? []
    : favorites.map((id) => itemsById.get(id)).filter((i): i is ItemView => Boolean(i));
  const sections = menu.categories
    .map((c) => ({
      c,
      items: result.items.filter((i) => i.categoryId === c.id && visible.has(i.id)),
    }))
    .filter((s) => s.items.length > 0);
  const offsets = sections.map((_, i) =>
    sections.slice(0, i).reduce((n, s) => n + s.items.length, 0),
  );

  return (
    <div className="flex flex-col gap-8 pt-2">
      {favItems.length ? (
        <section id={sectionId(FAVORITES_SECTION)} aria-labelledby="h-favorites">
          <h2 id="h-favorites" className="mb-3 flex items-center gap-2 text-xl font-extrabold">
            <CategoryIcon name="heart" className="text-pink-text size-5" />
            {t("nav.favorites")}
          </h2>
          <Grid items={favItems} view={view} query="" />
        </section>
      ) : null}
      {sections.map(({ c, items }, i) => (
        <section
          key={c.id}
          id={sectionId(c.id)}
          aria-labelledby={`h-${c.id}`}
          className="[content-visibility:auto]"
          style={{ containIntrinsicSize: `auto ${estimateHeight(items.length, view)}px` }}
        >
          <h2 id={`h-${c.id}`} className="mb-3 flex items-center gap-2 text-xl font-extrabold">
            <CategoryIcon name={c.icon} className="text-gold size-5" />
            {c.title}
          </h2>
          <Grid items={items} view={view} query="" priorityFrom={offsets[i]} />
        </section>
      ))}
    </div>
  );
}
