"use client";

import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useT } from "@/components/providers/i18n-provider";
import { Toaster, useToast } from "@/components/ui/toast";
import { normalizeTableCode } from "@/lib/domain/limits";
import { ITEM_FLAGS, type ItemFlag } from "@/lib/domain/types";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  applyMenuFilters,
  buildSearchIndex,
  type MenuFilters,
} from "@/lib/menu/filter";
import type { MenuView, PromoView } from "@/lib/menu/view";
import { useCart } from "@/lib/store/cart";
import { usePrefs, type ViewMode } from "@/lib/store/prefs";
import { flyToCart } from "@/lib/ui/fly-to-cart";
import { vibrate } from "@/lib/utils";
import { CartBar } from "./cart-bar";
import { CategoryNav } from "./category-nav";
import { MenuContext, type MenuCtx } from "./menu-context";
import { MenuList } from "./menu-list";
import { PromoStrip } from "./promo-strip";
import { Toolbar } from "./toolbar";

const loadDish = () => import("./dish-sheet");
const loadCart = () => import("./cart-sheet");
const loadFilters = () => import("./filter-sheet");
const DishSheet = dynamic(loadDish, { ssr: false });
const CartSheet = dynamic(loadCart, { ssr: false });
const FilterSheet = dynamic(loadFilters, { ssr: false });

export const VIEW_COOKIE = "unipub_view";

type Props = {
  menu: MenuView;
  promos: PromoView[];
  initialView: ViewMode;
  isOpenNow: boolean;
};

function readDishFromUrl(): string | null {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("dish");
  if (fromQuery) return fromQuery;
  return url.hash.startsWith("#dish-") ? decodeURIComponent(url.hash.slice(6)) : null;
}

function writeDishToUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("dish", id);
  else url.searchParams.delete("dish");
  if (url.hash.startsWith("#dish-")) url.hash = "";
  window.history.replaceState(window.history.state, "", url);
}

export function MenuApp({ menu, promos, initialView, isOpenNow }: Props) {
  const t = useT();
  const announce = useToast((s) => s.announce);
  const addLine = useCart((s) => s.add);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filters, setFilters] = useState<MenuFilters>(EMPTY_FILTERS);
  const [view, setViewState] = useState<ViewMode>(initialView);
  const [dish, setDish] = useState<{ id: string | null; open: boolean }>({ id: null, open: false });
  const [cartOpen, setCartOpen] = useState(false);
  const [cartMounted, setCartMounted] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** remount key: every opening starts from the applied filters */
  const [filtersSession, setFiltersSession] = useState(0);

  const itemsById = useMemo(() => new Map(menu.items.map((i) => [i.id, i])), [menu.items]);
  const soldOut = useMemo(() => new Set(menu.soldOut), [menu.soldOut]);
  const flagLabels = useMemo(
    () =>
      Object.fromEntries(ITEM_FLAGS.map((f) => [f, t(`flags.${f}`)])) as Record<ItemFlag, string>,
    [t],
  );
  const index = useMemo(
    () => buildSearchIndex(menu.items, menu.categories, menu.allergens, flagLabels),
    [menu.items, menu.categories, menu.allergens, flagLabels],
  );
  const result = useMemo(
    () => applyMenuFilters(menu.items, { query: deferredQuery, filters, index, soldOut }),
    [menu.items, deferredQuery, filters, index, soldOut],
  );

  useEffect(() => {
    void Promise.resolve(useCart.persist.rehydrate()).then(() =>
      useCart.getState().pruneUnavailable(new Set(itemsById.keys())),
    );
    void usePrefs.persist.rehydrate();

    const url = new URL(window.location.href);
    const token = url.searchParams.get("t");
    if (token) {
      const code = normalizeTableCode(token.split(".")[0]);
      if (code) useCart.getState().setQrTable(code, token);
      url.searchParams.delete("t");
      window.history.replaceState(window.history.state, "", url);
    }
    const dishId = readDishFromUrl();
    if (dishId && itemsById.has(dishId)) {
      writeDishToUrl(dishId);
      queueMicrotask(() => setDish({ id: dishId, open: true }));
    }

    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(() => {
      void loadDish();
      void loadCart();
    });
  }, [itemsById]);

  const openDish = useCallback((id: string) => {
    setDish({ id, open: true });
    writeDishToUrl(id);
  }, []);

  const closeDish = useCallback((open: boolean) => {
    if (open) return;
    setDish((d) => ({ ...d, open: false }));
    writeDishToUrl(null);
  }, []);

  const openCart = useCallback(() => {
    setCartMounted(true);
    setCartOpen(true);
  }, []);

  const addToCart = useCallback(
    (id: string, from?: HTMLElement | null) => {
      const item = itemsById.get(id);
      if (!item || soldOut.has(id)) return;
      addLine(id);
      vibrate();
      if (from) flyToCart(from);
      announce(t("cart.added", { name: item.name }));
    },
    [itemsById, soldOut, addLine, announce, t],
  );

  const setView = useCallback((v: ViewMode) => {
    setViewState(v);
    document.cookie = `${VIEW_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const resetAll = useCallback(() => {
    setQuery("");
    setFilters(EMPTY_FILTERS);
  }, []);

  const ctx = useMemo<MenuCtx>(
    () => ({ menu, itemsById, soldOut, isOpenNow, openDish, openCart, addToCart }),
    [menu, itemsById, soldOut, isOpenNow, openDish, openCart, addToCart],
  );

  return (
    <MenuContext.Provider value={ctx}>
      <PromoStrip promos={promos} />
      <CategoryNav categories={menu.categories} flat={!result.grouped} onLeaveFlat={resetAll} />
      <Toolbar
        query={query}
        onQuery={setQuery}
        filters={filters}
        onFilters={setFilters}
        onOpenFilters={() => {
          setFiltersSession((n) => n + 1);
          setFiltersOpen(true);
        }}
        view={view}
        onView={setView}
        found={deferredQuery.trim() ? result.items.length : null}
      />
      <main id="menu" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-8 outline-none">
        <MenuList
          result={result}
          view={view}
          query={deferredQuery}
          filtersActive={activeFilterCount(filters) > 0}
          onReset={resetAll}
          onPickQuery={setQuery}
        />
      </main>
      <CartBar onOpen={openCart} />
      <Toaster />
      {dish.id ? (
        <DishSheet
          itemId={dish.id}
          open={dish.open}
          onOpenChange={closeDish}
          onOpenDish={openDish}
        />
      ) : null}
      {cartMounted ? <CartSheet open={cartOpen} onOpenChange={setCartOpen} /> : null}
      {filtersSession ? (
        <FilterSheet
          key={filtersSession}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          filters={filters}
          onFilters={setFilters}
          countFor={(f) =>
            applyMenuFilters(menu.items, { query: deferredQuery, filters: f, index, soldOut }).items
              .length
          }
        />
      ) : null}
    </MenuContext.Provider>
  );
}
