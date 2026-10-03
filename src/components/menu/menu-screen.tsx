import type { NativeLocale, PublicMenu } from "@/lib/domain/types";
import { openStatus } from "@/lib/domain/schedule";
import { timedOverlay } from "@/lib/menu/timed";
import { activePromotions, toMenuView } from "@/lib/menu/view";
import type { ViewMode } from "@/lib/store/prefs";
import { Header } from "./header";
import { MenuApp } from "./menu-app";
import { Footer, KaraokeSection, RulesSection, Splash } from "./sections";

/** The whole guest page; `prebuilt` = static export, re-evaluated against the guest's clock. */
export function MenuScreen({
  menu,
  locale,
  now,
  initialView,
  prebuilt = false,
}: {
  menu: PublicMenu;
  locale: NativeLocale;
  now: Date;
  initialView: ViewMode;
  prebuilt?: boolean;
}) {
  const status = openStatus(menu.venue.hours, now, menu.venue.timezone);
  return (
    <>
      <Splash serviceRateBp={menu.venue.serviceRateBp} />
      <Header venue={menu.venue} locale={locale} status={status} now={now} />
      <MenuApp
        menu={toMenuView(menu, locale, now)}
        promos={activePromotions(menu, locale, now)}
        initialView={initialView}
        isOpenNow={status.open}
        overlay={prebuilt ? timedOverlay(menu, locale) : undefined}
      />
      <KaraokeSection venue={menu.venue} locale={locale} features={menu.features} />
      <RulesSection venue={menu.venue} locale={locale} />
      <Footer venue={menu.venue} locale={locale} />
    </>
  );
}
