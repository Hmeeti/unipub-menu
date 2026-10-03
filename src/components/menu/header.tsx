import { Phone, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { InstagramIcon, MapPinIcon, WhatsAppIcon } from "@/components/ui/brand-icons";
import type { NativeLocale, PublicVenue } from "@/lib/domain/types";
import type { OpenStatus } from "@/lib/domain/schedule";
import { pick } from "@/lib/i18n/text";
import { cn, httpsOnly } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const LOCALE_LABELS: Record<NativeLocale, string> = { ru: "РУС", kk: "ҚАЗ", en: "ENG" };

type Props = { venue: PublicVenue; locale: NativeLocale; status: OpenStatus };

export async function Header({ venue, locale, status }: Props) {
  const t = await getTranslations("header");
  const c = venue.contacts;
  const weekdays = t("weekdays").split("|");

  let statusText: string;
  if (status.open) statusText = t("openUntil", { time: status.closesAt });
  else if (!status.opensAt) statusText = t("closed");
  else {
    const today = new Intl.DateTimeFormat("en-US", { timeZone: venue.timezone, weekday: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "weekday")?.value;
    const todayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(today ?? "");
    statusText =
      status.opensWeekday === todayIdx || status.opensWeekday === null
        ? t("opensAt", { time: status.opensAt })
        : t("opensOn", { day: weekdays[status.opensWeekday] ?? "", time: status.opensAt });
  }

  const contacts = [
    c.phone
      ? { href: `tel:${c.phone}`, label: `${t("call")} ${c.phoneDisplay}`, icon: Phone }
      : null,
    c.whatsapp
      ? {
          href: `https://wa.me/${c.whatsapp.replace(/\D/g, "")}`,
          label: t("whatsapp"),
          icon: WhatsAppIcon,
        }
      : null,
    httpsOnly(c.instagram)
      ? { href: c.instagram!, label: t("instagram"), icon: InstagramIcon }
      : null,
    httpsOnly(c.map2gis) ? { href: c.map2gis!, label: t("map"), icon: MapPinIcon } : null,
  ].filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <header className="mx-auto w-full max-w-6xl px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="flex items-center justify-between gap-2">
        <nav
          aria-label={t("language")}
          className="border-line bg-surface flex rounded-full border p-0.5"
        >
          {(Object.keys(LOCALE_LABELS) as NativeLocale[]).map((l) => (
            <a
              key={l}
              href={`/${l}`}
              hrefLang={l}
              lang={l}
              aria-current={l === locale ? "page" : undefined}
              className={cn(
                "grid min-h-11 min-w-11 place-items-center rounded-full px-2.5 text-[13px] font-bold no-underline",
                l === locale ? "bg-surface-2 text-text" : "text-muted hover:text-text",
              )}
            >
              {LOCALE_LABELS[l]}
            </a>
          ))}
        </nav>
        <ThemeToggle toLight={t("themeToLight")} toDark={t("themeToDark")} />
      </div>

      <div className="mt-5 flex flex-col items-center text-center">
        <h1 className="wordmark text-text text-[3.25rem]">
          unipub
          <span className="wordmark-dot" aria-hidden="true" />
        </h1>
        <p className="text-gold mt-1 text-[14px]">{pick(venue.content.tagline, locale)}</p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="border-line bg-surface inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[14px] font-semibold">
            <span
              className={cn("size-2 rounded-full", status.open ? "bg-success" : "bg-danger")}
              aria-hidden="true"
            />
            {statusText}
          </span>
          {c.rating ? (
            <a
              href={httpsOnly(c.review2gis) ?? httpsOnly(c.map2gis) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="border-line bg-surface text-text inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[14px] font-semibold no-underline"
            >
              <span className="sr-only">{t("rating")} </span>
              <Star className="fill-gold text-gold size-4" aria-hidden="true" />
              <span className="tabular-nums">{c.rating}</span>
              {c.reviewsCount ? (
                <span className="text-muted tabular-nums">· {c.reviewsCount}</span>
              ) : null}
            </a>
          ) : null}
        </div>

        {contacts.length ? (
          <ul className="mt-3 flex gap-2">
            {contacts.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  aria-label={label}
                  title={label}
                  {...(href.startsWith("https://")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="border-line bg-surface text-gold hover:border-line-strong grid size-11 place-items-center rounded-full border active:scale-90"
                >
                  <Icon className="size-5" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </header>
  );
}
