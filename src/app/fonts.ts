import { Manrope, Syne } from "next/font/google";

/**
 * Self-hosted at build time. `subsets` only controls preloading: every range ships in the CSS,
 * so cyrillic-ext (Kazakh ә ғ қ ң ө ү һ) loads on demand instead of competing with the LCP image.
 * Coverage is verified after build by scripts/check-fonts.mjs.
 */
export const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-manrope",
});

/** Wordmark only ("unipub"), Latin glyphs. */
export const syne = Syne({
  subsets: ["latin"],
  weight: "800",
  display: "swap",
  variable: "--font-syne",
});
