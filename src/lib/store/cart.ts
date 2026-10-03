"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { MAX_QTY } from "@/lib/domain/limits";
import { MAX_SPLIT_PEOPLE, SHARED_ID, type SplitPerson } from "@/lib/domain/split";

export const CART_TTL_MS = 6 * 60 * 60 * 1000;

export type CartLine = { id: string; qty: number };

type CartState = {
  lines: CartLine[];
  table: string;
  /** signed QR token; when present the table is verified server-side */
  tableToken: string | null;
  comment: string;
  split: { on: boolean; people: SplitPerson[]; assign: Record<string, string> };
  updatedAt: number;
};

type CartActions = {
  add: (id: string, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => { line: CartLine; index: number } | null;
  restore: (line: CartLine, index: number) => void;
  clear: () => void;
  setTable: (table: string) => void;
  setQrTable: (table: string, token: string) => void;
  setComment: (comment: string) => void;
  toggleSplit: (defaultNames: { me: string; person: (n: number) => string }) => void;
  addPerson: (name: string) => void;
  removePerson: (id: string) => void;
  renamePerson: (id: string, name: string) => void;
  assign: (itemId: string, personId: string) => void;
  pruneUnavailable: (validIds: Set<string>) => void;
};

const initial: CartState = {
  lines: [],
  table: "",
  tableToken: null,
  comment: "",
  split: { on: false, people: [], assign: {} },
  updatedAt: 0,
};

const clampQty = (q: number) => Math.max(0, Math.min(MAX_QTY, Math.floor(q)));

let personSeq = 0;
const newPersonId = () => `p${Date.now().toString(36)}${(personSeq++).toString(36)}`;

export const useCart = create<CartState & CartActions>()(
  persist(
    (set, get) => {
      const touch = (patch: Partial<CartState>) => set({ ...patch, updatedAt: Date.now() });
      return {
        ...initial,
        add: (id, qty = 1) => {
          const lines = [...get().lines];
          const i = lines.findIndex((l) => l.id === id);
          if (i >= 0) lines[i] = { id, qty: clampQty(lines[i]!.qty + qty) };
          else lines.push({ id, qty: clampQty(qty) });
          touch({ lines });
        },
        setQty: (id, qty) => {
          const q = clampQty(qty);
          const lines = get()
            .lines.map((l) => (l.id === id ? { id, qty: q } : l))
            .filter((l) => l.qty > 0);
          touch({ lines });
        },
        remove: (id) => {
          const index = get().lines.findIndex((l) => l.id === id);
          if (index < 0) return null;
          const line = get().lines[index]!;
          touch({ lines: get().lines.filter((l) => l.id !== id) });
          return { line, index };
        },
        restore: (line, index) => {
          const lines = get().lines.filter((l) => l.id !== line.id);
          lines.splice(Math.min(index, lines.length), 0, line);
          touch({ lines });
        },
        clear: () => touch({ lines: [], comment: "", split: { ...get().split, assign: {} } }),
        setTable: (table) => touch({ table, tableToken: null }),
        setQrTable: (table, token) => touch({ table, tableToken: token }),
        setComment: (comment) => touch({ comment }),
        toggleSplit: (names) => {
          const s = get().split;
          if (s.on) return touch({ split: { ...s, on: false } });
          const people = s.people.length
            ? s.people
            : [
                { id: newPersonId(), name: names.me },
                { id: newPersonId(), name: names.person(2) },
              ];
          touch({ split: { ...s, on: true, people } });
        },
        addPerson: (name) => {
          const s = get().split;
          if (s.people.length >= MAX_SPLIT_PEOPLE) return;
          touch({ split: { ...s, people: [...s.people, { id: newPersonId(), name }] } });
        },
        removePerson: (id) => {
          const s = get().split;
          if (s.people.length <= 1) return;
          const assign = Object.fromEntries(Object.entries(s.assign).filter(([, p]) => p !== id));
          touch({ split: { ...s, people: s.people.filter((p) => p.id !== id), assign } });
        },
        renamePerson: (id, name) => {
          const s = get().split;
          const clean = name.slice(0, 24);
          touch({
            split: { ...s, people: s.people.map((p) => (p.id === id ? { ...p, name: clean } : p)) },
          });
        },
        assign: (itemId, personId) => {
          const s = get().split;
          if (personId !== SHARED_ID && !s.people.some((p) => p.id === personId)) return;
          touch({ split: { ...s, assign: { ...s.assign, [itemId]: personId } } });
        },
        pruneUnavailable: (validIds) => {
          const lines = get().lines.filter((l) => validIds.has(l.id));
          if (lines.length !== get().lines.length) touch({ lines });
        },
      };
    },
    {
      name: "unipub:cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ lines, table, tableToken, comment, split, updatedAt }) => ({
        lines,
        table,
        tableToken,
        comment,
        split,
        updatedAt,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<CartState> | undefined;
        if (!p || !p.updatedAt || Date.now() - p.updatedAt > CART_TTL_MS) return current;
        return { ...current, ...p };
      },
    },
  ),
);

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.qty, 0);
}
