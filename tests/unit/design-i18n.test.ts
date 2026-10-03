import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsp, cspOrigins } from "@/lib/security/csp";
import { format } from "@/lib/i18n/text";
import imageLoader from "@/lib/images/loader";

const root = path.resolve(import.meta.dirname, "../..");

function themeVars(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector ${selector} not found`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]),
  );
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "surface-2"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "surface-2"],
  ["gold", "bg"],
  ["gold", "surface"],
  ["gold-dim", "surface"],
  ["link", "bg"],
  ["link", "surface"],
  ["pink-text", "surface"],
  ["pink-text", "surface-2"],
  ["on-accent", "accent"],
  ["success", "surface"],
  ["danger", "surface"],
  ["danger", "surface-2"],
];

describe("design tokens", () => {
  const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  for (const [theme, selector] of [
    ["dark", ":root"],
    ["light", ':root[data-theme="light"]'],
  ] as const) {
    const vars = themeVars(css, selector);
    it.each(TEXT_PAIRS)(`${theme}: --%s on --%s meets WCAG AA 4.5:1`, (fg, bg) => {
      expect(vars[fg], fg).toBeDefined();
      expect(vars[bg], bg).toBeDefined();
      expect(contrast(vars[fg]!, vars[bg]!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("messages", () => {
  const load = (l: string) =>
    JSON.parse(readFileSync(path.join(root, `messages/${l}.json`), "utf8")) as Record<
      string,
      Record<string, string>
    >;
  const keys = (m: Record<string, Record<string, string>>) =>
    Object.entries(m)
      .flatMap(([ns, v]) => Object.keys(v).map((k) => `${ns}.${k}`))
      .sort();
  const ru = load("ru");

  it.each(["kk", "en"])("%s has exactly the same keys and placeholders as ru", (l) => {
    const other = load(l);
    expect(keys(other)).toEqual(keys(ru));
    for (const [ns, group] of Object.entries(ru)) {
      for (const [k, v] of Object.entries(group)) {
        const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        expect(ph(other[ns]![k]!), `${l}:${ns}.${k}`).toEqual(ph(v));
      }
    }
  });

  it("interpolates client templates without ICU", () => {
    expect(format("Корзина · {count} · {total}", { count: 3, total: "12 400 ₸" })).toBe(
      "Корзина · 3 · 12 400 ₸",
    );
    expect(format("{missing} stays", {})).toBe("{missing} stays");
  });
});

describe("csp", () => {
  it("is nonce-based, strict-dynamic and forbids framing/objects", () => {
    const csp = buildCsp({ nonce: "abc", dev: false, imageOrigins: ["https://cdn.example.com"] });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("https://cdn.example.com");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("only accepts https origins for extra sources", () => {
    expect(cspOrigins(["http://evil.test", "https://ok.test/path", undefined, "nonsense"])).toEqual(
      ["https://ok.test"],
    );
  });
});

describe("image loader", () => {
  it("maps own uploads to the nearest pre-rendered variant", () => {
    expect(imageLoader({ src: "https://cdn.test/items/a#v", width: 300 })).toBe(
      "https://cdn.test/items/a-320.webp",
    );
    expect(imageLoader({ src: "https://cdn.test/items/a#v", width: 2000 })).toBe(
      "https://cdn.test/items/a-1280.webp",
    );
  });

  it("resizes unsplash through query params", () => {
    const url = new URL(
      imageLoader({ src: "https://images.unsplash.com/photo-1?w=900&q=80", width: 640 }),
    );
    expect(url.searchParams.get("w")).toBe("640");
    expect(url.searchParams.get("auto")).toBe("format");
  });
});
