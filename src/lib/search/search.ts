/**
 * Port of the legacy js/search.js: word matching with light RU stemming, Latin→Cyrillic
 * transliteration and a small culinary alias dictionary ("тунец" finds "тунца", "ribay" ≈ рибай).
 * Extended with keyboard-layout fixing (a query typed in the wrong layout: "nfhnfh" → "тартар").
 */

const TRANSLIT: Record<string, string> = {
  a: "а",
  b: "б",
  v: "в",
  g: "г",
  d: "д",
  e: "е",
  yo: "ё",
  zh: "ж",
  z: "з",
  i: "и",
  y: "й",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  f: "ф",
  h: "х",
  c: "ц",
  ch: "ч",
  sh: "ш",
  sch: "щ",
  yu: "ю",
  ya: "я",
  x: "кс",
  w: "в",
  q: "к",
  j: "дж",
};

const ALIASES: Record<string, string[]> = {
  тунец: ["тунц", "tuna"],
  тунца: ["тунц", "тунец", "tuna"],
  стейк: ["steak", "рибай", "ribeye", "ribay"],
  рибай: ["ribeye", "ribay", "стейк", "steak"],
  ribeye: ["рибай", "ribay", "стейк"],
  коктейл: ["cocktail", "коктейль"],
  cocktail: ["коктейл", "коктейль"],
  сёмг: ["семг", "salmon"],
  семг: ["сёмг", "salmon"],
  vip: ["вип"],
  вип: ["vip"],
  пив: ["beer", "lager", "ipa"],
  beer: ["пив"],
  десерт: ["dessert", "торт", "чизкейк"],
  паст: ["pasta", "тальятелле", "спагетти"],
};

const EN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU_LAYOUT = "йцукенгшщзхъфывапролджэячсмитьбюё";

const ENDINGS = [
  "ами",
  "ями",
  "ов",
  "ев",
  "ей",
  "ой",
  "ою",
  "ией",
  "ием",
  "иям",
  "иях",
  "ах",
  "ях",
  "ом",
  "ем",
  "ую",
  "юю",
  "ая",
  "яя",
  "ые",
  "ие",
  "ых",
  "их",
  "ам",
  "ям",
  "у",
  "ю",
  "а",
  "я",
  "ы",
  "и",
  "е",
  "о",
  "ов",
  "ев",
  "ий",
  "ый",
  "ой",
  "ing",
  "ers",
  "ies",
  "es",
  "s",
];

export function fold(str: string): string {
  return String(str ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function translitToRu(token: string): string {
  const src = String(token ?? "").toLowerCase();
  if (!/^[a-z]+$/.test(src)) return src;
  let out = "";
  let i = 0;
  while (i < src.length) {
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (TRANSLIT[three]) {
      out += TRANSLIT[three];
      i += 3;
    } else if (TRANSLIT[two]) {
      out += TRANSLIT[two];
      i += 2;
    } else {
      const ch = src[i] as string;
      const prev = src[i - 1];
      const next = src[i + 1];
      const isConsonant = (c: string | undefined) => Boolean(c && /[bcdfghjklmnpqrstvwxz]/.test(c));
      out += ch === "y" && isConsonant(prev) && isConsonant(next) ? "ы" : (TRANSLIT[ch] ?? ch);
      i += 1;
    }
  }
  return out;
}

/** Re-map a token typed on the wrong keyboard layout (EN↔RU). Returns null if not applicable. */
export function switchLayout(token: string): string | null {
  const t = token.toLowerCase();
  if (/^[a-z[\];',.`]+$/.test(t)) {
    return [...t].map((ch) => RU_LAYOUT[EN_LAYOUT.indexOf(ch)] ?? ch).join("");
  }
  if (/^[а-яё]+$/.test(t)) {
    return [...t].map((ch) => EN_LAYOUT[RU_LAYOUT.indexOf(ch)] ?? ch).join("");
  }
  return null;
}

/** Crude RU/EN culinary stemming. */
export function stem(token: string): string {
  let t = translitToRu(fold(token));
  if (t.length <= 3) return t;
  for (const end of ENDINGS) {
    if (t.length - end.length >= 3 && t.endsWith(end)) {
      t = t.slice(0, -end.length);
      break;
    }
  }
  // «тунца» / «тунец» → common root «тунц»
  if (t.endsWith("ец") && t.length > 4) t = `${t.slice(0, -2)}ц`;
  if (t.endsWith("ца") && t.length > 4) t = t.slice(0, -1);
  return t;
}

function expandToken(token: string): string[] {
  const base = stem(token);
  const set = new Set<string>([base, fold(token), translitToRu(fold(token))]);
  for (const [key, aliases] of Object.entries(ALIASES)) {
    const keyStem = stem(key);
    if (keyStem === base || fold(key) === fold(token)) {
      set.add(keyStem);
      for (const alias of aliases) {
        set.add(stem(alias));
        set.add(fold(alias));
      }
    }
  }
  return [...set].filter(Boolean);
}

export function tokenize(text: string): string[] {
  return fold(text)
    .split(" ")
    .filter((t) => t.length > 1);
}

export type MatchResult = { ok: boolean; score: number };

type Prepared = { hay: string; tokens: string[]; stems: string[] };

export function prepareHaystack(parts: Array<string | null | undefined>): Prepared {
  const hay = fold(parts.filter(Boolean).join(" "));
  const tokens = tokenize(hay);
  return { hay, tokens, stems: tokens.map(stem) };
}

function matchToken(qt: string, h: Prepared): number {
  for (const variant of expandToken(qt)) {
    if (h.stems.includes(variant) || h.tokens.includes(variant)) return 3;
    for (const hs of h.stems) {
      if (!hs) continue;
      if (hs.startsWith(variant) || variant.startsWith(hs) || hs.includes(variant)) {
        if (Math.min(hs.length, variant.length) >= 3) return 2;
      }
    }
    if (variant.length >= 3 && h.hay.includes(variant)) return 1;
  }
  return 0;
}

function matchTokens(queryTokens: string[], h: Prepared): MatchResult {
  let score = 0;
  for (const qt of queryTokens) {
    const s = matchToken(qt, h);
    if (!s) return { ok: false, score: 0 };
    score += s;
  }
  return { ok: true, score };
}

/** All query words must match; falls back to the alternate keyboard layout. */
export function matchQuery(
  query: string,
  haystack: Prepared | Array<string | null | undefined>,
): MatchResult {
  const q = fold(query);
  if (!q) return { ok: true, score: 0 };
  const h = Array.isArray(haystack) ? prepareHaystack(haystack) : haystack;
  const tokens = tokenize(q);
  if (!tokens.length) return { ok: true, score: 0 };
  const direct = matchTokens(tokens, h);
  if (direct.ok) return direct;
  const switched = tokens.map((t) => switchLayout(t));
  if (switched.every((t): t is string => Boolean(t))) {
    const alt = matchTokens(switched, h);
    if (alt.ok) return { ok: true, score: Math.max(1, alt.score - 1) };
  }
  return { ok: false, score: 0 };
}

/** Patterns to highlight for a query (longest first). Rendering is done by React, never via innerHTML. */
export function highlightPatterns(query: string): string[] {
  const tokens = tokenize(fold(query));
  const out = new Set<string>();
  for (const t of tokens) {
    for (const v of expandToken(t)) if (v.length >= 3) out.add(v);
    if (t.length >= 3) out.add(t);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

export function splitHighlight(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const patterns = highlightPatterns(query);
  if (!patterns.length || !text) return [{ text, hit: false }];
  const escaped = patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "giu");
  const folded = text.replace(/ё/g, "е").replace(/Ё/g, "Е");
  const out: Array<{ text: string; hit: boolean }> = [];
  let last = 0;
  for (const m of folded.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx), hit: false });
    out.push({ text: text.slice(idx, idx + m[0].length), hit: true });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}
