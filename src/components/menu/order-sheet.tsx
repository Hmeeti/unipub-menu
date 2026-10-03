"use client";

import { BellRing, Check, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/components/providers/i18n-provider";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatPrice } from "@/lib/domain/money";
import { remindOrder } from "@/lib/orders/client";
import type { OrderStatusView } from "@/lib/orders/types";
import { useOrders } from "@/lib/store/orders";
import { cn } from "@/lib/utils";
import { useMenu } from "./menu-context";

function SuccessMark({ failed }: { failed: boolean }) {
  return (
    <svg
      viewBox="0 0 52 52"
      className={cn("size-20", failed ? "text-danger" : "text-gold")}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle className="check-ring" cx="26" cy="26" r="23" pathLength="1" />
      {failed ? (
        <path className="check-tick" d="M26 15v14M26 36v1" pathLength="1" />
      ) : (
        <path className="check-tick" d="M15 27l7 7 15-16" pathLength="1" />
      )}
    </svg>
  );
}

function Step({
  done,
  active,
  title,
  detail,
}: {
  done: boolean;
  active: boolean;
  title: string;
  detail: string | null;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2",
          done ? "border-gold bg-gold text-bg" : "border-line-strong",
          active && "border-gold status-pulse",
        )}
        aria-hidden="true"
      >
        {done ? <Check className="size-4" strokeWidth={3} /> : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn("text-base font-bold", !done && !active && "text-muted")}>{title}</span>
        {detail ? <span className="text-muted text-[14px]">{detail}</span> : null}
      </span>
    </li>
  );
}

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Remind({ order }: { order: OrderStatusView }) {
  const t = useT();
  const update = useOrders((s) => s.update);
  const showToast = useToast((s) => s.show);
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const waiting = order.status === "queued" || order.status === "sent";
  const remindAt = order.remindAt ? Date.parse(order.remindAt) : null;
  const left = remindAt === null ? 0 : remindAt - now;

  useEffect(() => {
    if (!waiting || remindAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [waiting, remindAt]);

  if (!waiting) return null;
  // While waiting, a missing remindAt means the one allowed reminder was already used.
  if (remindAt === null) {
    return (
      <p role="status" className="text-muted flex items-center justify-center gap-2 text-[14px]">
        <BellRing className="size-4" aria-hidden="true" />
        {t("order.reminded")}
      </p>
    );
  }
  const onRemind = async () => {
    setSending(true);
    const res = await remindOrder(order.publicId);
    setSending(false);
    if (res.ok) update(res.order);
    else showToast({ message: t("order.errorServer") }, 5000);
  };
  return (
    <button
      type="button"
      disabled={left > 0 || sending}
      aria-busy={sending}
      onClick={() => void onRemind()}
      className="border-line-strong inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-base font-bold tabular-nums active:scale-[0.98] disabled:opacity-60"
    >
      <BellRing className="size-5" aria-hidden="true" />
      {left > 0 ? t("order.remindIn", { time: formatLeft(left) }) : t("order.remind")}
    </button>
  );
}

export default function OrderSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { menu } = useMenu();
  const order = useOrders((s) => s.last);
  const close = () => onOpenChange(false);

  const footer = (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={close}
        className="bg-accent text-on-accent min-h-14 w-full rounded-2xl px-4 text-base font-bold active:scale-[0.98]"
      >
        {t("order.more")}
      </button>
      {menu.reviewUrl ? (
        <a
          href={menu.reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link inline-flex min-h-11 items-center justify-center gap-2 font-semibold"
        >
          <Star className="size-4" aria-hidden="true" />
          {t("order.review")}
        </a>
      ) : null}
    </div>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("order.title")}
      closeLabel={t("common.close")}
      footer={footer}
    >
      {order ? (
        <div className="flex flex-col gap-6 pb-2">
          <div className="flex flex-col items-center gap-2 pt-2 text-center">
            <SuccessMark failed={order.status === "failed"} />
            <p className="font-display text-2xl font-extrabold">
              {t("order.sentTitle", { number: order.number })}
            </p>
            <p className="text-muted text-[15px] tabular-nums">
              {t("order.total", { total: formatPrice(order.total) })}
            </p>
          </div>
          <ol aria-live="polite" className="flex flex-col gap-4">
            <Step
              done={order.status === "sent" || order.status === "accepted"}
              active={order.status === "queued"}
              title={t("order.stepSent")}
              detail={
                order.status === "queued"
                  ? t("order.statusQueued")
                  : order.status === "sent"
                    ? t("order.statusSent")
                    : null
              }
            />
            <Step
              done={order.status === "accepted"}
              active={order.status === "sent"}
              title={t("order.stepAccepted")}
              detail={
                order.status === "accepted" && order.acceptedBy
                  ? t("order.statusAccepted", { name: order.acceptedBy })
                  : null
              }
            />
          </ol>
          {order.status === "failed" ? (
            <p
              role="alert"
              className="border-danger text-danger rounded-2xl border p-4 font-semibold"
            >
              {t("order.statusFailed")}
            </p>
          ) : null}
          {order.unavailable.length ? (
            <p role="status" className="border-gold rounded-2xl border p-4 font-semibold">
              {t("order.unavailable", { names: order.unavailable.join(", ") })}
            </p>
          ) : null}
          <Remind order={order} />
        </div>
      ) : null}
    </Sheet>
  );
}
