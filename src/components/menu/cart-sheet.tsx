"use client";

import { QrCode, Trash2, UserPlus, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useId, useRef, useState, type PointerEvent } from "react";
import { useLocale, useT } from "@/components/providers/i18n-provider";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import { MAX_QTY, normalizeTableCode } from "@/lib/domain/limits";
import { formatPrice, percentLabel } from "@/lib/domain/money";
import { MAX_SPLIT_PEOPLE, SHARED_ID, calcSplit, ownerOf } from "@/lib/domain/split";
import { useCart } from "@/lib/store/cart";
import { usePrefs } from "@/lib/store/prefs";
import { useCartTotals, type PricedLine } from "@/lib/store/use-cart-totals";
import { ANY_WAITER, type OrderStatusView } from "@/lib/orders/types";
import { cn } from "@/lib/utils";
import { useMenu } from "./menu-context";
import { TABLE_INPUT_ID, useSubmitOrder } from "./use-submit-order";

const Turnstile = dynamic(() => import("@/components/ui/turnstile").then((m) => m.Turnstile), {
  ssr: false,
});

const SWIPE_DELETE_PX = 90;

function CartRow({ line, onRemove }: { line: PricedLine; onRemove: () => void }) {
  const t = useT();
  const setQty = useCart((s) => s.setQty);
  const split = useCart((s) => s.split);
  const assign = useCart((s) => s.assign);
  const rowRef = useRef<HTMLLIElement>(null);
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const { item } = line;

  const onDown = (e: PointerEvent<HTMLLIElement>) => {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("button, select, input"))
      return;
    drag.current = { x: e.clientX, dx: 0 };
  };
  const onMove = (e: PointerEvent<HTMLLIElement>) => {
    const d = drag.current;
    if (!d || !rowRef.current) return;
    d.dx = Math.min(0, e.clientX - d.x);
    rowRef.current.style.transform = `translateX(${d.dx}px)`;
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !rowRef.current) return;
    rowRef.current.style.transform = "";
    if (d.dx < -SWIPE_DELETE_PX) onRemove();
  };

  return (
    <li
      ref={rowRef}
      className="border-line flex touch-pan-y flex-col gap-2 border-b py-3 transition-transform last:border-b-0"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn("text-base leading-snug font-semibold", line.unavailable && "text-muted")}
          >
            {item.name}
          </p>
          <p className="text-muted text-[13px] tabular-nums">
            {line.unavailable ? t("item.soldOut") : `${formatPrice(item.price)} × ${line.qty}`}
          </p>
        </div>
        <span className="text-gold pt-0.5 text-base font-bold tabular-nums">
          {formatPrice(line.lineTotal)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        {line.unavailable ? (
          <span />
        ) : (
          <Stepper
            value={line.qty}
            max={MAX_QTY}
            onChange={(n) => (n <= 0 ? onRemove() : setQty(item.id, n))}
            incLabel={t("item.increase", { name: item.name })}
            decLabel={t("item.decrease", { name: item.name })}
          />
        )}
        {split.on && !line.unavailable ? (
          <label className="flex min-w-0 items-center gap-2">
            <span className="sr-only">{t("split.who", { name: item.name })}</span>
            <select
              value={ownerOf(item.id, split.assign, split.people)}
              onChange={(e) => assign(item.id, e.target.value)}
              className="border-line-strong bg-surface-2 min-h-11 max-w-[9.5rem] truncate rounded-xl border px-3 text-[14px] font-semibold"
            >
              {split.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={SHARED_ID}>{t("split.shared")}</option>
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("cart.remove", { name: item.name })}
          className="text-muted grid size-11 shrink-0 place-items-center rounded-full active:scale-90"
        >
          <Trash2 className="size-5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function TableField() {
  const t = useT();
  const id = TABLE_INPUT_ID;
  const table = useCart((s) => s.table);
  const token = useCart((s) => s.tableToken);
  const setTable = useCart((s) => s.setTable);
  const [touched, setTouched] = useState(false);
  const invalid = touched && table !== "" && !normalizeTableCode(table);

  if (token) {
    return (
      <div className="border-line bg-surface-2 flex min-h-12 items-center gap-3 rounded-2xl border px-4">
        <QrCode className="text-gold size-5" aria-hidden="true" />
        <span className="flex-1 font-semibold">{t("cart.tableFromQr", { table })}</span>
        <button
          type="button"
          onClick={() => setTable(table)}
          className="text-link min-h-11 px-2 font-semibold"
        >
          {t("cart.tableChange")}
        </button>
      </div>
    );
  }
  return (
    <div>
      <label
        htmlFor={id}
        className="text-gold mb-1 block text-[13px] font-bold tracking-wide uppercase"
      >
        {t("cart.table")}
      </label>
      <input
        id={id}
        value={table}
        onChange={(e) =>
          setTable(
            e.target.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, "")
              .slice(0, 8),
          )
        }
        onBlur={() => setTouched(true)}
        placeholder={t("cart.tablePlaceholder")}
        autoComplete="off"
        autoCapitalize="characters"
        inputMode="text"
        maxLength={8}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-err` : undefined}
        className="border-line bg-surface-2 focus:border-pink h-12 w-full rounded-2xl border px-4 text-base font-semibold tracking-wider uppercase placeholder:font-normal placeholder:tracking-normal placeholder:normal-case focus:outline-none"
      />
      {invalid ? (
        <p id={`${id}-err`} className="text-danger mt-1 text-[13px]">
          {t("cart.tableInvalid")}
        </p>
      ) : null}
    </div>
  );
}

function SplitPanel({ lines, total }: { lines: PricedLine[]; total: number }) {
  const t = useT();
  const { menu } = useMenu();
  const split = useCart((s) => s.split);
  const toggleSplit = useCart((s) => s.toggleSplit);
  const addPerson = useCart((s) => s.addPerson);
  const removePerson = useCart((s) => s.removePerson);
  const renamePerson = useCart((s) => s.renamePerson);
  const parts = split.on
    ? calcSplit(
        lines.map((l) => ({ itemId: l.item.id, lineTotal: l.lineTotal })),
        split.people,
        split.assign,
        menu.serviceRateBp,
        total,
      )
    : [];

  return (
    <section className="border-line rounded-3xl border p-4">
      <button
        type="button"
        role="switch"
        aria-checked={split.on}
        onClick={() => toggleSplit({ me: t("split.me"), person: (n) => t("split.person", { n }) })}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-base font-bold"
      >
        {t("split.on")}
        <span
          className={cn(
            "relative h-7 w-12 rounded-full transition-colors",
            split.on ? "bg-accent" : "bg-line-strong",
          )}
          aria-hidden="true"
        >
          <span
            className={cn(
              "absolute top-1 size-5 rounded-full bg-white transition-[left]",
              split.on ? "left-6" : "left-1",
            )}
          />
        </span>
      </button>
      {split.on ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-muted text-[13px]">{t("split.hint")}</p>
          <ul className="flex flex-col gap-2">
            {split.people.map((p) => {
              const part = parts.find((x) => x.id === p.id);
              return (
                <li key={p.id} className="flex items-center gap-2">
                  <input
                    value={p.name}
                    onChange={(e) => renamePerson(p.id, e.target.value)}
                    aria-label={t("split.rename")}
                    maxLength={24}
                    className="border-line bg-surface-2 focus:border-pink h-11 min-w-0 flex-1 rounded-xl border px-3 text-[15px] focus:outline-none"
                  />
                  <span className="text-gold w-24 text-right font-bold tabular-nums">
                    {formatPrice(part?.total ?? 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePerson(p.id)}
                    disabled={split.people.length <= 1}
                    aria-label={t("split.removePerson", { name: p.name })}
                    className="text-muted grid size-11 place-items-center rounded-full active:scale-90 disabled:opacity-30"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => addPerson(t("split.person", { n: split.people.length + 1 }))}
            disabled={split.people.length >= MAX_SPLIT_PEOPLE}
            className="border-line-strong inline-flex min-h-11 items-center gap-2 self-start rounded-full border px-4 font-semibold active:scale-95 disabled:opacity-40"
          >
            <UserPlus className="size-4" aria-hidden="true" />
            {split.people.length >= MAX_SPLIT_PEOPLE ? t("split.maxPeople") : t("split.addPerson")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function WaiterPicker() {
  const t = useT();
  const { menu } = useMenu();
  const waiterId = usePrefs((s) => s.waiterId);
  const setWaiter = usePrefs((s) => s.setWaiter);
  const options = [...menu.waiters, { id: ANY_WAITER, name: t("cart.waiterUnknown") }];
  return (
    <fieldset>
      <legend className="text-gold mb-2 text-[13px] font-bold tracking-wide uppercase">
        {t("cart.waiterTitle")}
      </legend>
      <div role="radiogroup" className="grid grid-cols-2 gap-2">
        {options.map((w) => {
          const checked = waiterId === w.id;
          return (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setWaiter(w.id)}
              className={cn(
                "flex min-h-14 items-center justify-center rounded-2xl border px-3 text-center text-base font-bold active:scale-[0.98]",
                checked
                  ? "border-pink bg-surface-2 text-pink-text"
                  : "border-line bg-surface text-text",
              )}
            >
              {w.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function CartSheet({
  open,
  onOpenChange,
  onOrdered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrdered: (order: OrderStatusView) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const { state: submitState, submit, onCaptchaToken } = useSubmitOrder(onOrdered);
  const sending = submitState.kind === "sending";
  const { menu, isOpenNow } = useMenu();
  const { lines, totals, count } = useCartTotals();
  const remove = useCart((s) => s.remove);
  const restore = useCart((s) => s.restore);
  const clear = useCart((s) => s.clear);
  const comment = useCart((s) => s.comment);
  const setComment = useCart((s) => s.setComment);
  const showToast = useToast((s) => s.show);
  const commentId = useId();

  const removeLine = (line: PricedLine) => {
    const removed = remove(line.item.id);
    if (!removed) return;
    showToast(
      {
        message: t("cart.removed", { name: line.item.name }),
        actionLabel: t("cart.undo"),
        onAction: () => restore(removed.line, removed.index),
      },
      5000,
    );
  };

  const empty = lines.length === 0;
  const footer = empty ? null : (
    <div className="flex flex-col gap-2">
      <dl className="flex flex-col gap-1 text-[15px] tabular-nums">
        <div className="text-muted flex justify-between">
          <dt>{t("cart.subtotal")}</dt>
          <dd>{formatPrice(totals.subtotal)}</dd>
        </div>
        <div className="text-muted flex justify-between">
          <dt>{t("cart.service", { percent: percentLabel(menu.serviceRateBp) })}</dt>
          <dd>{formatPrice(totals.service)}</dd>
        </div>
        <div className="flex justify-between text-lg font-extrabold">
          <dt>{t("cart.total")}</dt>
          <dd className="text-gold">{formatPrice(totals.total)}</dd>
        </div>
      </dl>
      {!menu.features.orders ? (
        <p className="text-muted text-center text-[13px]">{t("cart.ordersOff")}</p>
      ) : !isOpenNow ? (
        <p className="text-muted text-center text-[13px]">{t("cart.closedNote")}</p>
      ) : null}
      <div aria-live="assertive" className="empty:hidden">
        {submitState.kind === "error" ||
        submitState.kind === "duplicate" ||
        submitState.kind === "captcha" ? (
          <p className="text-danger text-center text-[14px] font-semibold">{submitState.message}</p>
        ) : null}
      </div>
      {submitState.kind === "captcha" ? (
        <Turnstile
          siteKey={submitState.siteKey}
          language={locale}
          onToken={onCaptchaToken}
          onExpire={() => undefined}
        />
      ) : null}
      {submitState.kind === "duplicate" ? (
        <button
          type="button"
          onClick={() => void submit({ confirmDuplicate: true })}
          className="border-line-strong min-h-12 w-full rounded-2xl border px-4 text-base font-bold active:scale-[0.98]"
        >
          {t("order.duplicateConfirm")}
        </button>
      ) : null}
      <button
        type="button"
        disabled={!count || sending || !menu.features.orders}
        aria-busy={sending}
        onClick={() => void submit()}
        className="bg-accent text-on-accent min-h-14 w-full rounded-2xl px-4 text-base font-bold tabular-nums active:scale-[0.98] disabled:opacity-50"
      >
        {sending ? t("order.sending") : t("cart.submit", { total: formatPrice(totals.total) })}
      </button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("cart.title")}
      closeLabel={t("common.close")}
      footer={footer}
    >
      {empty ? (
        <p className="text-muted py-10 text-center text-[15px]">{t("cart.empty")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <ul>
            {lines.map((l) => (
              <CartRow key={l.item.id} line={l} onRemove={() => removeLine(l)} />
            ))}
          </ul>
          <button
            type="button"
            onClick={clear}
            className="text-muted min-h-11 self-end px-2 text-[14px] font-semibold underline-offset-4 hover:underline"
          >
            {t("cart.clear")}
          </button>
          <TableField />
          <div>
            <label
              htmlFor={commentId}
              className="text-gold mb-1 block text-[13px] font-bold tracking-wide uppercase"
            >
              {t("cart.comment")}
            </label>
            <textarea
              id={commentId}
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 300))}
              placeholder={t("cart.commentPlaceholder")}
              rows={2}
              maxLength={300}
              className="border-line bg-surface-2 focus:border-pink w-full resize-none rounded-2xl border px-4 py-3 text-[15px] focus:outline-none"
            />
          </div>
          <SplitPanel lines={lines} total={totals.total} />
          <WaiterPicker />
        </div>
      )}
    </Sheet>
  );
}
