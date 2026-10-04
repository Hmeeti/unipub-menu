import { CalendarDays, ChevronDown, Mic, Music } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { NativeLocale, PublicVenue, VenueFeatures } from "@/lib/domain/types";
import { percentLabel } from "@/lib/domain/money";
import { pick, pickList } from "@/lib/i18n/text";
import { RequestButton } from "./request-button";

export async function Splash({ serviceRateBp }: { serviceRateBp: number }) {
  const t = await getTranslations("splash");
  return (
    <div
      id="splash"
      className="splash bg-bg fixed inset-0 z-[100] cursor-pointer place-items-center"
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="wordmark text-text text-6xl">
          unipub
          <span className="wordmark-dot" aria-hidden="true" />
        </p>
        <div className="splash__line from-gold to-pink h-px w-40 origin-left bg-gradient-to-r" />
        <p className="text-gold text-[13px] tracking-[0.2em] uppercase">{t("tag")}</p>
        <p className="text-muted text-[13px]">
          {t("fee", { percent: percentLabel(serviceRateBp) })}
        </p>
      </div>
      <p className="text-muted absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] text-[13px]">
        {t("skip")}
      </p>
    </div>
  );
}

export async function KaraokeSection({
  venue,
  locale,
  features,
}: {
  venue: PublicVenue;
  locale: NativeLocale;
  features: VenueFeatures;
}) {
  const t = await getTranslations("karaoke");
  const rules = pickList(venue.content.karaokeRules, locale);
  if (!rules.length && !features.songs && !features.booking) return null;
  return (
    <section aria-labelledby="karaoke-title" className="mx-auto mt-4 w-full max-w-6xl px-4">
      <div className="border-line rounded-3xl border bg-[radial-gradient(circle_at_85%_0%,var(--glow-1),transparent_55%),var(--surface)] p-5">
        <h2 id="karaoke-title" className="flex items-center gap-2 text-xl font-extrabold">
          <Mic className="text-pink-text size-5" aria-hidden="true" />
          {t("title")}
        </h2>
        {features.songs || features.booking ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {features.songs ? (
              <RequestButton type="song" className="bg-accent text-on-accent">
                <Music className="size-4" aria-hidden="true" />
                {t("orderSong")}
              </RequestButton>
            ) : null}
            {features.booking ? (
              <RequestButton type="booking" className="border-line-strong border">
                <CalendarDays className="size-4" aria-hidden="true" />
                {t("book")}
              </RequestButton>
            ) : null}
          </div>
        ) : null}
        {rules.length ? (
          <>
            <h3 className="text-gold mt-4 text-[13px] font-bold tracking-wide uppercase">
              {t("rulesTitle")}
            </h3>
            <ol className="text-muted marker:text-gold-dim mt-2 list-decimal space-y-1.5 pl-5 text-[15px]">
              {rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </section>
  );
}

export async function RulesSection({
  venue,
  locale,
}: {
  venue: PublicVenue;
  locale: NativeLocale;
}) {
  const t = await getTranslations("rules");
  const rules = pickList(venue.content.rules, locale);
  if (!rules.length) return null;
  return (
    <section aria-label={t("title")} className="mx-auto mt-4 w-full max-w-6xl px-4">
      <details className="group border-line bg-surface rounded-3xl border">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 text-lg font-bold [&::-webkit-details-marker]:hidden">
          {t("title")}
          <ChevronDown
            className="text-muted size-5 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <ul className="text-muted marker:text-pink list-disc space-y-2 px-5 pb-5 pl-10 text-[15px]">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function hoursLine(
  venue: PublicVenue,
  locale: NativeLocale,
  daily: (o: string, c: string) => string,
) {
  const days = venue.hours;
  const first = days.find(Boolean);
  if (first && days.every((d) => d && d.open === first.open && d.close === first.close)) {
    return [daily(first.open, first.close)];
  }
  const fmt = new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale, { weekday: "short" });
  // 2023-01-01 is a Sunday → index 0 matches WeeklyHours.
  const name = (i: number) => fmt.format(new Date(Date.UTC(2023, 0, 1 + i, 12)));
  const range = (i: number) => (days[i] ? `${days[i]!.open}–${days[i]!.close}` : "—");
  // Consecutive days with the same hours share a line: "вс–чт: 12:00–02:00".
  const groups: { from: number; to: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const last = groups[groups.length - 1];
    if (last && range(last.to) === range(i)) last.to = i;
    else groups.push({ from: i, to: i });
  }
  return groups.map(
    ({ from, to }) => `${from === to ? name(from) : `${name(from)}–${name(to)}`}: ${range(from)}`,
  );
}

export async function Footer({ venue, locale }: { venue: PublicVenue; locale: NativeLocale }) {
  const t = await getTranslations("footer");
  const c = venue.contacts;
  const lines = hoursLine(venue, locale, (open, close) => t("hours", { open, close }));
  const review = c.review2gis?.startsWith("https://") ? c.review2gis : null;
  return (
    <footer className="text-muted mx-auto mt-10 w-full max-w-6xl px-4 pb-28 text-[14px]">
      <div className="border-line grid gap-5 border-t pt-6 sm:grid-cols-3">
        <div>
          <h2 className="text-gold mb-1 text-[13px] font-bold tracking-wide uppercase">
            {t("address")}
          </h2>
          <p>{pick(c.address, locale)}</p>
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <div>
          <h2 className="text-gold mb-1 text-[13px] font-bold tracking-wide uppercase">
            {t("contacts")}
          </h2>
          {c.phone ? (
            <a href={`tel:${c.phone}`} className="inline-flex min-h-11 items-center tabular-nums">
              {c.phoneDisplay}
            </a>
          ) : null}
        </div>
        <div>
          {review ? (
            <a
              href={review}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-semibold"
            >
              {t("reviews")}
            </a>
          ) : null}
        </div>
      </div>
      <p className="mt-6 text-[13px]">
        © {new Date().getFullYear()} {venue.name} · Taraz
      </p>
    </footer>
  );
}
