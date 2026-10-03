"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Stored in a cookie (not here) so the server renders the right layout without a shift. */
export type ViewMode = "grid" | "list";

type PrefsState = {
  favorites: string[];
  /** last chosen waiter, remembered between visits */
  waiterId: string | null;
  recentSearches: string[];
  toggleFavorite: (id: string) => void;
  setWaiter: (id: string | null) => void;
  pushSearch: (q: string) => void;
};

const MAX_RECENT = 6;

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      favorites: [],
      waiterId: null,
      recentSearches: [],
      toggleFavorite: (id) => {
        const fav = get().favorites;
        set({ favorites: fav.includes(id) ? fav.filter((f) => f !== id) : [...fav, id] });
      },
      setWaiter: (waiterId) => set({ waiterId }),
      pushSearch: (raw) => {
        const q = raw.trim().slice(0, 60);
        if (q.length < 2) return;
        const rest = get().recentSearches.filter((r) => r.toLowerCase() !== q.toLowerCase());
        set({ recentSearches: [q, ...rest].slice(0, MAX_RECENT) });
      },
    }),
    {
      name: "unipub:prefs",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ favorites, waiterId, recentSearches }) => ({
        favorites,
        waiterId,
        recentSearches,
      }),
    },
  ),
);
