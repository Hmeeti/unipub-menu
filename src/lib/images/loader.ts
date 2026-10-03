/** Widths pre-rendered by the upload pipeline as `${base}-${w}.webp` on object storage. */
export const VARIANT_WIDTHS = [320, 480, 640, 960, 1280] as const;

export const VARIANT_MARKER = "#v";

function pickVariant(width: number): number {
  return VARIANT_WIDTHS.find((w) => w >= width) ?? VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]!;
}

type LoaderArgs = { src: string; width: number; quality?: number };

/**
 * - Own uploads: `src` is the variant base followed by `#v` → nearest pre-rendered WebP on the CDN.
 * - Unsplash (legacy photos): the CDN resizes by query params.
 * - Anything else (local /public files) is served as is.
 */
export default function imageLoader({ src, width, quality }: LoaderArgs): string {
  if (src.endsWith(VARIANT_MARKER)) {
    return `${src.slice(0, -VARIANT_MARKER.length)}-${pickVariant(width)}.webp`;
  }
  if (src.startsWith("https://images.unsplash.com/")) {
    const url = new URL(src);
    url.searchParams.set("auto", "format");
    url.searchParams.set("fit", "crop");
    url.searchParams.set("w", String(width));
    url.searchParams.set("q", String(quality ?? 60));
    return url.toString();
  }
  return src;
}

export function imageSrc(asset: { src: string; variants?: boolean }): string {
  return asset.variants ? `${asset.src}${VARIANT_MARKER}` : asset.src;
}
