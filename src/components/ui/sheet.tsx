"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** visually hide the title (still announced by screen readers) */
  hideTitle?: boolean;
  description?: string;
  closeLabel: string;
  footer?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
};

const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 0.6;

/** Bottom sheet on Radix Dialog (focus trap, Esc, focus return) with swipe-down to close. */
export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle,
  description,
  closeLabel,
  footer,
  header,
  children,
  className,
}: SheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  /** Radix only restores focus to a Dialog.Trigger; our sheets open programmatically. */
  const returnTo = useRef<HTMLElement | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = contentRef.current;
    if (!d || !el) return;
    d.dy = Math.max(0, e.clientY - d.y);
    el.style.transform = `translateY(${d.dy}px)`;
    el.style.transition = "none";
  };
  const onPointerUp = () => {
    const d = drag.current;
    const el = contentRef.current;
    drag.current = null;
    if (!d || !el) return;
    const velocity = d.dy / Math.max(1, performance.now() - d.t);
    el.style.transition = "transform 0.2s ease";
    el.style.transform = "";
    if (d.dy > CLOSE_DISTANCE || (d.dy > 30 && velocity > CLOSE_VELOCITY)) onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay bg-overlay fixed inset-0 z-50" />
        <Dialog.Content
          ref={contentRef}
          className={cn(
            "sheet fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col",
            "border-line bg-surface text-text shadow-sheet rounded-t-[28px] border border-b-0 outline-none",
            className,
          )}
          {...(description ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={() => {
            const active = document.activeElement;
            returnTo.current =
              active instanceof HTMLElement && active !== document.body ? active : null;
          }}
          onCloseAutoFocus={(e) => {
            const el = returnTo.current;
            returnTo.current = null;
            if (!el?.isConnected) return;
            e.preventDefault();
            el.focus({ preventScroll: true });
          }}
        >
          <div
            className="flex shrink-0 touch-none flex-col px-5 pt-2 select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div
              className="bg-line-strong mx-auto mb-2 h-1.5 w-10 rounded-full"
              aria-hidden="true"
            />
            <div className="flex min-h-11 items-center gap-3">
              <Dialog.Title
                className={cn(
                  "min-w-0 flex-1 text-lg leading-tight font-bold",
                  hideTitle && "sr-only",
                )}
              >
                {title}
              </Dialog.Title>
              {hideTitle ? <div className="flex-1" /> : null}
              <Dialog.Close
                className="bg-surface-2 text-text grid size-11 shrink-0 place-items-center rounded-full active:scale-95"
                aria-label={closeLabel}
              >
                <X className="size-5" aria-hidden="true" />
              </Dialog.Close>
            </div>
            {description ? (
              <Dialog.Description className="text-muted text-sm">{description}</Dialog.Description>
            ) : null}
            {header}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
            {children}
          </div>
          {footer ? (
            <div className="border-line bg-surface shrink-0 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
