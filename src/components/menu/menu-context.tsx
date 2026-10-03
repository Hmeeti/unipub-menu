"use client";

import { createContext, useContext } from "react";
import type { ItemView, MenuView } from "@/lib/menu/view";

export type MenuCtx = {
  menu: MenuView;
  itemsById: Map<string, ItemView>;
  soldOut: ReadonlySet<string>;
  isOpenNow: boolean;
  openDish: (id: string) => void;
  openCart: () => void;
  addToCart: (id: string, from?: HTMLElement | null) => void;
};

export const MenuContext = createContext<MenuCtx | null>(null);

export function useMenu(): MenuCtx {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu outside MenuApp");
  return ctx;
}
