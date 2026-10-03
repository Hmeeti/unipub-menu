"use client";

import { Phone } from "lucide-react";
import { useT } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { useMenu } from "./menu-context";

/** Shown instead of online ordering when the backend is absent or unreachable. */
export function CallWaiter({
  withText = true,
  className,
}: {
  withText?: boolean;
  className?: string;
}) {
  const t = useT();
  const { menu } = useMenu();
  return (
    <div role="note" className={cn("flex flex-col items-center gap-2 text-center", className)}>
      {withText ? (
        <>
          <p className="text-lg font-extrabold">{t("common.callWaiterTitle")}</p>
          <p className="text-muted text-[15px]">{t("common.callWaiterText")}</p>
        </>
      ) : null}
      {menu.phone ? (
        <a
          href={`tel:${menu.phone.tel}`}
          className="border-line-strong bg-surface text-text inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-base font-bold no-underline active:scale-[0.98]"
        >
          <Phone className="text-gold size-4" aria-hidden="true" />
          {t("common.callVenue", { phone: menu.phone.display })}
        </a>
      ) : null}
    </div>
  );
}
