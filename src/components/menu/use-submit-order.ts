"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale, useT } from "@/components/providers/i18n-provider";
import { normalizeTableCode } from "@/lib/domain/limits";
import { SHARED_ID } from "@/lib/domain/split";
import {
  newIdempotencyKey,
  submitOrder,
  type ClientResult,
  type OrderPayload,
} from "@/lib/orders/client";
import { ANY_WAITER, type OrderStatusView } from "@/lib/orders/types";
import { useCart } from "@/lib/store/cart";
import { usePrefs } from "@/lib/store/prefs";
import { useMenu } from "./menu-context";
import { focusTableInput } from "./table-field";

export type SubmitState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string; offline?: boolean }
  | { kind: "duplicate"; message: string }
  | { kind: "captcha"; siteKey: string; message: string };

const IN_PROGRESS_RETRIES = 3;
const IN_PROGRESS_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useSubmitOrder(onOrdered: (order: OrderStatusView) => void) {
  const t = useT();
  const locale = useLocale();
  const { itemsById, soldOut } = useMenu();
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  /** One key per distinct cart: a retry after a network error replays instead of creating a second order. */
  const attempt = useRef<{ sig: string; key: string } | null>(null);
  const captcha = useRef<{ siteKey: string | null; token: string | null }>({
    siteKey: null,
    token: null,
  });
  const busy = useRef(false);

  const buildPayload = useCallback((): OrderPayload | null => {
    const c = useCart.getState();
    const lines = c.lines
      .filter((l) => itemsById.has(l.id) && !soldOut.has(l.id))
      .map((l) => ({ itemId: l.id, qty: l.qty }));
    if (!lines.length) return null;
    const ids = new Set(lines.map((l) => l.itemId));
    const people = c.split.people.map((p, i) => ({
      id: p.id,
      name: p.name.trim() || t("split.person", { n: i + 1 }),
    }));
    const personIds = new Set([...people.map((p) => p.id), SHARED_ID]);
    const split =
      c.split.on && people.length >= 2
        ? {
            people,
            assign: Object.fromEntries(
              Object.entries(c.split.assign).filter(
                ([item, p]) => ids.has(item) && personIds.has(p),
              ),
            ),
          }
        : undefined;
    const tableCode = normalizeTableCode(c.table);
    const comment = c.comment.trim();
    return {
      lines,
      ...(c.tableToken ? { tableToken: c.tableToken } : tableCode ? { tableCode } : {}),
      waiterId: usePrefs.getState().waiterId ?? ANY_WAITER,
      locale,
      ...(comment ? { comment } : {}),
      ...(split ? { split } : {}),
    };
  }, [itemsById, soldOut, locale, t]);

  const focusTable = focusTableInput;

  const handleError = (res: Exclude<ClientResult, { ok: true }>) => {
    const error = (message: string) => setState({ kind: "error", message });
    switch (res.error) {
      case "unavailable": {
        const ids = res.unavailable ?? [];
        const names = ids.map((id) => itemsById.get(id)?.name ?? id).join(", ");
        const cart = useCart.getState();
        for (const id of ids) cart.remove(id);
        return error(t("order.errorUnavailable", { names }));
      }
      case "duplicate":
        return setState({
          kind: "duplicate",
          message: t("order.duplicate", { number: res.duplicateOf ?? "" }),
        });
      case "captcha_required":
      case "captcha_failed": {
        const siteKey = res.siteKey ?? captcha.current.siteKey;
        if (!siteKey) return error(t("order.errorServer"));
        captcha.current.siteKey = siteKey;
        return setState({
          kind: "captcha",
          siteKey,
          message: t(res.error === "captcha_failed" ? "order.errorCaptcha" : "order.captcha"),
        });
      }
      case "table_token_invalid": {
        const cart = useCart.getState();
        cart.setTable(cart.table);
        error(t("order.errorTableToken"));
        return focusTable();
      }
      case "table_required":
      case "table_unknown":
        error(
          t(
            res.error === "table_required" ? "order.errorTableRequired" : "order.errorTableUnknown",
          ),
        );
        return focusTable();
      case "waiter_unknown":
        usePrefs.getState().setWaiter(null);
        return error(t("order.errorWaiter"));
      case "rate_limited":
        return error(
          t("order.errorRateLimited", {
            minutes: Math.max(1, Math.ceil((res.retryAfterSec ?? 60) / 60)),
          }),
        );
      case "closed":
        return error(t("order.errorClosed"));
      case "orders_disabled":
        return error(t("order.errorOff"));
      case "invalid":
      case "origin":
        return error(t("order.errorInvalid"));
      case "network":
        return setState({ kind: "error", message: t("order.errorNetwork"), offline: true });
      default:
        return setState({ kind: "error", message: t("order.errorServer"), offline: true });
    }
  };

  const submit = async (opts: { confirmDuplicate?: boolean } = {}) => {
    if (busy.current) return;
    const payload = buildPayload();
    if (!payload) return;
    if (!payload.tableToken && !payload.tableCode) {
      setState({ kind: "error", message: t("order.errorTableRequired") });
      focusTable();
      return;
    }
    const sig = JSON.stringify(payload);
    if (attempt.current?.sig !== sig) attempt.current = { sig, key: newIdempotencyKey() };
    const key = attempt.current.key;
    const turnstileToken = captcha.current.token ?? undefined;
    // Turnstile tokens are single-use: whatever the outcome, a new one is needed next time.
    captcha.current.token = null;

    busy.current = true;
    setState({ kind: "sending" });
    let res: ClientResult = { ok: false, error: "server" };
    try {
      for (let i = 0; i <= IN_PROGRESS_RETRIES; i++) {
        res = await submitOrder(
          {
            ...payload,
            ...(opts.confirmDuplicate ? { confirmDuplicate: true } : {}),
            ...(turnstileToken ? { turnstileToken } : {}),
          },
          key,
        );
        if (res.ok || res.error !== "in_progress") break;
        await sleep(IN_PROGRESS_DELAY_MS);
      }
    } finally {
      busy.current = false;
    }

    if (res.ok) {
      attempt.current = null;
      setState({ kind: "idle" });
      useCart.getState().clear();
      onOrdered(res.order);
      return;
    }
    handleError(res);
  };

  const onCaptchaToken = (token: string) => {
    captcha.current.token = token;
    void submit();
  };

  return { state, submit, onCaptchaToken };
}
