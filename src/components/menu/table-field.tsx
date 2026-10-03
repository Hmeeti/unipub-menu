"use client";

import { QrCode } from "lucide-react";
import { useState } from "react";
import { useT } from "@/components/providers/i18n-provider";
import { normalizeTableCode } from "@/lib/domain/limits";
import { useCart } from "@/lib/store/cart";

/** One table field per open sheet; errors from the server focus it by id. */
export const TABLE_INPUT_ID = "guest-table";

export function focusTableInput() {
  requestAnimationFrame(() => document.getElementById(TABLE_INPUT_ID)?.focus());
}

/** Shared by the cart and the request sheet; the table lives in the cart store (QR or typed). */
export function TableField({ optional = false }: { optional?: boolean }) {
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
        required={!optional}
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
