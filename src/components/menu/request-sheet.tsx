"use client";

import { CheckCircle2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale, useT } from "@/components/providers/i18n-provider";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { BOOKING_MAX_DAYS, normalizeTableCode } from "@/lib/domain/limits";
import { formatKzPhone, normalizeKzPhone } from "@/lib/domain/phone";
import { VENUE_TZ } from "@/lib/domain/schedule";
import { newIdempotencyKey } from "@/lib/orders/client";
import { ANY_WAITER } from "@/lib/orders/types";
import {
  fetchRequestStatus,
  submitRequest,
  type RequestClientResult,
  type RequestPayloadInput,
} from "@/lib/requests/client";
import {
  PAYMENT_METHODS,
  type GuestRequestType,
  type PaymentMethod,
  type RequestStatusView,
} from "@/lib/requests/types";
import { useCart } from "@/lib/store/cart";
import { usePrefs } from "@/lib/store/prefs";
import { useRequestUi } from "@/lib/store/requests-ui";
import { cn } from "@/lib/utils";
import { useMenu } from "./menu-context";
import { TableField, focusTableInput } from "./table-field";

const Turnstile = dynamic(() => import("@/components/ui/turnstile").then((m) => m.Turnstile), {
  ssr: false,
});

const TITLES: Record<GuestRequestType, string> = {
  waiter: "request.waiterTitle",
  bill: "request.billTitle",
  song: "request.songTitle",
  booking: "request.bookingTitle",
};
const SENT: Record<GuestRequestType, string> = {
  waiter: "request.sentWaiter",
  bill: "request.sentBill",
  song: "request.sentSong",
  booking: "request.sentBooking",
};
const PAY_LABEL: Record<PaymentMethod, string> = {
  cash: "request.payCash",
  card: "request.payCard",
  qr: "request.payQr",
};
const STATUS_POLL_MS = 4000;
const STATUS_POLL_MAX_MS = 10 * 60_000;

const label = "text-gold mb-1 block text-[13px] font-bold tracking-wide uppercase";
const field =
  "border-line bg-surface-2 focus:border-pink h-12 w-full rounded-2xl border px-4 text-base focus:outline-none";

function venueYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VENUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function Field({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {title}
      </label>
      {children}
    </div>
  );
}

type FormState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string }
  | { kind: "captcha"; siteKey: string; message: string };

function RequestForm({ type, onDone }: { type: GuestRequestType; onDone: () => void }) {
  const t = useT();
  const locale = useLocale();
  const { menu } = useMenu();
  const uid = useId();
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [artist, setArtist] = useState("");
  const [song, setSong] = useState("");
  const [roomId, setRoomId] = useState("");
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [today] = useState(() => venueYmd(new Date()));
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("20:00");
  const [guests, setGuests] = useState(2);
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [result, setResult] = useState<RequestStatusView | null>(null);
  const attempt = useRef<{ sig: string; key: string } | null>(null);
  const captchaToken = useRef<string | null>(null);
  const captchaSiteKey = useRef<string | null>(null);
  const busy = useRef(false);

  const tablePart = () => {
    const c = useCart.getState();
    if (c.tableToken) return { tableToken: c.tableToken };
    const code = normalizeTableCode(c.table);
    return code ? { tableCode: code } : {};
  };

  /** null + error shown when the form is incomplete; the server validates everything again. */
  const build = (): RequestPayloadInput | null => {
    const error = (message: string) => {
      setState({ kind: "error", message });
      return null;
    };
    const base = { type, locale };
    if (type === "waiter" || type === "bill") {
      const table = tablePart();
      if (!("tableToken" in table) && !("tableCode" in table)) {
        focusTableInput();
        return error(t("order.errorTableRequired"));
      }
      const waiterId = usePrefs.getState().waiterId ?? ANY_WAITER;
      return { ...base, ...table, waiterId, ...(type === "bill" ? { payment } : {}) };
    }
    if (type === "song") {
      if (!artist.trim() || !song.trim()) return error(t("request.errorRequired"));
      const table = tablePart();
      if (!roomId && !("tableToken" in table) && !("tableCode" in table)) {
        focusTableInput();
        return error(t("request.songWhere"));
      }
      return {
        ...base,
        ...table,
        artist: artist.trim(),
        title: song.trim(),
        ...(roomId ? { roomId } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      };
    }
    if (name.trim().length < 2 || !date || !time) return error(t("request.errorRequired"));
    const digits = normalizeKzPhone(phone);
    if (!digits) return error(t("request.errorPhone"));
    return {
      ...base,
      name: name.trim(),
      phone: digits,
      date,
      time,
      guests,
      ...(roomId ? { roomId } : {}),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    };
  };

  const handleError = (res: Exclude<RequestClientResult, { ok: true }>) => {
    const error = (message: string) => setState({ kind: "error", message });
    switch (res.error) {
      case "captcha_required":
      case "captcha_failed": {
        const siteKey = ("siteKey" in res && res.siteKey) || captchaSiteKey.current;
        if (!siteKey) return error(t("order.errorServer"));
        captchaSiteKey.current = siteKey;
        return setState({
          kind: "captcha",
          siteKey,
          message: t(res.error === "captcha_failed" ? "order.errorCaptcha" : "order.captcha"),
        });
      }
      case "table_token_invalid": {
        const cart = useCart.getState();
        cart.setTable(cart.table);
        focusTableInput();
        return error(t("order.errorTableToken"));
      }
      case "table_required":
        focusTableInput();
        return error(t(type === "song" ? "request.songWhere" : "order.errorTableRequired"));
      case "table_unknown":
        focusTableInput();
        return error(t("order.errorTableUnknown"));
      case "waiter_unknown":
        usePrefs.getState().setWaiter(null);
        return error(t("order.errorWaiter"));
      case "room_unknown":
        return error(t("request.errorRoom"));
      case "booking_past":
        return error(t("request.errorBookingPast"));
      case "booking_too_far":
        return error(t("request.errorBookingFar", { days: BOOKING_MAX_DAYS }));
      case "booking_invalid":
        return error(t("request.errorBookingInvalid"));
      case "delivery_failed":
        return error(
          menu.phone
            ? t("request.errorDeliveryPhone", { phone: menu.phone.display })
            : t("request.errorDelivery"),
        );
      case "rate_limited":
        return error(
          t("order.errorRateLimited", {
            minutes: Math.max(
              1,
              Math.ceil(
                ("retryAfterSec" in res && res.retryAfterSec ? res.retryAfterSec : 60) / 60,
              ),
            ),
          }),
        );
      case "closed":
        return error(t("order.errorClosed"));
      case "feature_off":
        return error(t("request.errorFeatureOff"));
      case "invalid":
      case "origin":
        return error(t("order.errorInvalid"));
      case "network":
        return error(t("order.errorNetwork"));
      default:
        return error(t("order.errorServer"));
    }
  };

  const submit = async () => {
    if (busy.current) return;
    const payload = build();
    if (!payload) return;
    const sig = JSON.stringify(payload);
    if (attempt.current?.sig !== sig) attempt.current = { sig, key: newIdempotencyKey() };
    const token = captchaToken.current;
    captchaToken.current = null;
    busy.current = true;
    setState({ kind: "sending" });
    let res: RequestClientResult = { ok: false, error: "server" };
    try {
      for (let i = 0; i < 3; i++) {
        res = await submitRequest(
          token ? { ...payload, turnstileToken: token } : payload,
          attempt.current.key,
        );
        if (res.ok || res.error !== "in_progress") break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      busy.current = false;
    }
    if (res.ok) {
      setState({ kind: "idle" });
      setResult(res.request);
      return;
    }
    handleError(res);
  };

  // Live "accepted" for waiter/bill/song while the success screen is open.
  const resultId = result && result.type !== "booking" ? result.publicId : null;
  const accepted = result?.status === "accepted";
  useEffect(() => {
    if (!resultId || accepted) return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - started > STATUS_POLL_MAX_MS) return window.clearInterval(timer);
      if (document.visibilityState === "hidden") return;
      const res = await fetchRequestStatus(resultId);
      if (res.ok) setResult(res.request);
    }, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [resultId, accepted]);

  if (result) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="text-gold pop-in size-16" strokeWidth={1.6} aria-hidden="true" />
        <p role="status" className="text-xl font-extrabold">
          {t(SENT[type], { number: result.number })}
        </p>
        {type === "booking" ? (
          <p className="text-muted text-[15px]">{t("request.bookingNext")}</p>
        ) : (
          <p aria-live="polite" className={cn("text-[15px]", !accepted && "text-muted")}>
            {accepted
              ? t("request.statusAccepted", { name: result.acceptedBy ?? "" })
              : t("request.statusWaiting")}
          </p>
        )}
        <button
          type="button"
          onClick={onDone}
          className="bg-accent text-on-accent mt-4 min-h-14 w-full rounded-2xl px-4 text-base font-bold active:scale-[0.98]"
        >
          {t("request.done")}
        </button>
      </div>
    );
  }

  const sending = state.kind === "sending";
  const roomSelect = (
    <Field id={`${uid}-room`} title={t("request.room")}>
      <select
        id={`${uid}-room`}
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        className={field}
      >
        <option value="">{t("request.roomNone")}</option>
        {menu.rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </Field>
  );
  const commentField = (placeholder: string) => (
    <Field id={`${uid}-comment`} title={t("request.comment")}>
      <textarea
        id={`${uid}-comment`}
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 200))}
        placeholder={placeholder}
        rows={2}
        maxLength={200}
        className={cn(field, "h-auto resize-none py-3 text-[15px]")}
      />
    </Field>
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      {type === "waiter" ? (
        <p className="text-muted text-[15px]">{t("request.waiterHint")}</p>
      ) : null}
      {type === "bill" ? <p className="text-muted text-[15px]">{t("request.billHint")}</p> : null}
      {type !== "booking" ? <TableField optional={type === "song"} /> : null}

      {type === "bill" ? (
        <fieldset>
          <legend className={label}>{t("request.payment")}</legend>
          <div role="radiogroup" className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={payment === m}
                onClick={() => setPayment(m)}
                className={cn(
                  "min-h-12 rounded-2xl border px-2 text-[15px] font-bold active:scale-[0.98]",
                  payment === m
                    ? "border-pink bg-surface-2 text-pink-text"
                    : "border-line bg-surface text-text",
                )}
              >
                {t(PAY_LABEL[m])}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {type === "song" ? (
        <>
          <Field id={`${uid}-artist`} title={t("request.artist")}>
            <input
              id={`${uid}-artist`}
              value={artist}
              onChange={(e) => setArtist(e.target.value.slice(0, 80))}
              maxLength={80}
              required
              autoComplete="off"
              className={field}
            />
          </Field>
          <Field id={`${uid}-song`} title={t("request.songName")}>
            <input
              id={`${uid}-song`}
              value={song}
              onChange={(e) => setSong(e.target.value.slice(0, 120))}
              maxLength={120}
              required
              autoComplete="off"
              className={field}
            />
          </Field>
          {menu.rooms.length ? roomSelect : null}
          {commentField(t("request.songCommentPlaceholder"))}
        </>
      ) : null}

      {type === "booking" ? (
        <>
          <Field id={`${uid}-name`} title={t("request.name")}>
            <input
              id={`${uid}-name`}
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              maxLength={60}
              required
              autoComplete="name"
              className={field}
            />
          </Field>
          <Field id={`${uid}-phone`} title={t("request.phone")}>
            <input
              id={`${uid}-phone`}
              value={phone}
              onChange={(e) => setPhone(e.target.value ? formatKzPhone(e.target.value) : "")}
              onFocus={() => !phone && setPhone("+7")}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+7 (7xx) xxx-xx-xx"
              required
              className={cn(field, "tabular-nums")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${uid}-date`} title={t("request.date")}>
              <input
                id={`${uid}-date`}
                type="date"
                value={date}
                min={today}
                max={addDays(today, BOOKING_MAX_DAYS)}
                onChange={(e) => setDate(e.target.value)}
                required
                className={field}
              />
            </Field>
            <Field id={`${uid}-time`} title={t("request.time")}>
              <input
                id={`${uid}-time`}
                type="time"
                value={time}
                step={900}
                onChange={(e) => setTime(e.target.value)}
                required
                className={field}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className={cn(label, "mb-0")} id={`${uid}-guests`}>
              {t("request.guests")}
            </span>
            <Stepper
              value={guests}
              max={50}
              onChange={(n) => setGuests(Math.max(1, n))}
              incLabel={t("request.guestsMore")}
              decLabel={t("request.guestsLess")}
            />
          </div>
          {menu.rooms.length ? roomSelect : null}
          {commentField(t("request.bookingCommentPlaceholder"))}
          <p className="text-muted text-[13px]">{t("request.privacy")}</p>
        </>
      ) : null}

      <div aria-live="assertive" className="empty:hidden">
        {state.kind === "error" || state.kind === "captcha" ? (
          <p className="text-danger text-center text-[14px] font-semibold">{state.message}</p>
        ) : null}
      </div>
      {state.kind === "captcha" ? (
        <Turnstile
          siteKey={state.siteKey}
          language={locale}
          onToken={(tok) => {
            captchaToken.current = tok;
            void submit();
          }}
          onExpire={() => undefined}
        />
      ) : null}
      <button
        type="submit"
        disabled={sending}
        aria-busy={sending}
        className="bg-accent text-on-accent min-h-14 w-full rounded-2xl px-4 text-base font-bold active:scale-[0.98] disabled:opacity-50"
      >
        {sending ? t("request.sending") : t("request.send")}
      </button>
    </form>
  );
}

export default function RequestSheet() {
  const t = useT();
  const open = useRequestUi((s) => s.open);
  const shown = useRequestUi((s) => s.shown);
  const session = useRequestUi((s) => s.session);
  const close = useRequestUi((s) => s.close);
  if (!shown) return null;
  return (
    <Sheet
      open={open !== null}
      onOpenChange={(o) => !o && close()}
      title={t(TITLES[shown])}
      closeLabel={t("common.close")}
    >
      <RequestForm key={session} type={shown} onDone={close} />
    </Sheet>
  );
}
