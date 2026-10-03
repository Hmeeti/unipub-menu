"use client";

import { create } from "zustand";

type Toast = { id: number; message: string; actionLabel?: string; onAction?: () => void };

type ToastState = {
  toast: Toast | null;
  /** screen-reader-only announcement (e.g. "added to cart") */
  announcement: string;
  show: (t: Omit<Toast, "id">, ms?: number) => void;
  dismiss: () => void;
  announce: (message: string) => void;
};

let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set) => ({
  toast: null,
  announcement: "",
  show: (t, ms = 3200) => {
    clearTimeout(timer);
    const id = ++seq;
    set({ toast: { ...t, id } });
    timer = setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), ms);
  },
  dismiss: () => {
    clearTimeout(timer);
    set({ toast: null });
  },
  announce: (message) => {
    set({ announcement: "" });
    requestAnimationFrame(() => set({ announcement: message }));
  },
}));

export function Toaster() {
  const toast = useToast((s) => s.toast);
  const announcement = useToast((s) => s.announcement);
  const dismiss = useToast((s) => s.dismiss);
  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4"
        role="status"
        aria-live="polite"
      >
        {toast ? (
          <div
            key={toast.id}
            className="toast-in border-line-strong bg-surface-2 shadow-sheet pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border py-2 pr-2 pl-4 text-[15px]"
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.actionLabel && toast.onAction ? (
              <button
                type="button"
                className="text-pink-text min-h-11 rounded-xl px-3 font-bold active:scale-95"
                onClick={() => {
                  toast.onAction?.();
                  dismiss();
                }}
              >
                {toast.actionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
