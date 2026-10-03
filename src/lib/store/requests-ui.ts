"use client";

import { create } from "zustand";
import type { GuestRequestType } from "@/lib/requests/types";

/** Lets server-rendered sections (karaoke) and the order sheet open the request sheet owned by MenuApp. */
export const useRequestUi = create<{
  open: GuestRequestType | null;
  /** last opened type, kept while the sheet animates out */
  shown: GuestRequestType | null;
  /** bumps on every opening so each form starts fresh */
  session: number;
  show: (type: GuestRequestType) => void;
  close: () => void;
}>((set) => ({
  open: null,
  shown: null,
  session: 0,
  show: (type) => set((s) => ({ open: type, shown: type, session: s.session + 1 })),
  close: () => set({ open: null }),
}));
