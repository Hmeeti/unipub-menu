"use client";

import { BellRing, ReceiptText } from "lucide-react";
import { useT } from "@/components/providers/i18n-provider";
import { RequestButton } from "./request-button";

export function ServiceBar() {
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t("request.serviceLabel")}
      className="mx-auto mt-3 flex w-full max-w-6xl gap-2 px-4"
    >
      <RequestButton type="waiter" className="border-line-strong bg-surface flex-1 border">
        <BellRing className="text-gold size-4" aria-hidden="true" />
        {t("request.waiterTitle")}
      </RequestButton>
      <RequestButton type="bill" className="border-line-strong bg-surface flex-1 border">
        <ReceiptText className="text-gold size-4" aria-hidden="true" />
        {t("request.billTitle")}
      </RequestButton>
    </div>
  );
}
