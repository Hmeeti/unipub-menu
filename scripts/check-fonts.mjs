// After `next build`: every Kazakh-specific letter must be covered by a self-hosted Manrope face.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const KAZAKH = "әғқңөұүһіӘҒҚҢӨҰҮҺІ";
const dir = path.resolve(".next/static");

function walk(d) {
  return readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const css = walk(dir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]);
const ranges = faces
  .filter((f) => /font-family:\s*["']?Manrope/i.test(f) && !/Fallback/i.test(f))
  .flatMap((f) => {
    const m = f.match(/unicode-range:\s*([^;]+)/);
    return m ? m[1].split(",").map((r) => r.trim().replace(/^U\+/i, "")) : [];
  })
  .map((r) => {
    const [a, b] = r.split("-");
    return [parseInt(a, 16), parseInt(b ?? a, 16)];
  });

if (!ranges.length) {
  console.error(
    "No Manrope @font-face with unicode-range found in .next/static — run `next build` first.",
  );
  process.exit(1);
}

const missing = [...KAZAKH].filter((ch) => {
  const cp = ch.codePointAt(0);
  return !ranges.some(([a, b]) => cp >= a && cp <= b);
});

if (missing.length) {
  console.error(`Kazakh letters not covered by self-hosted fonts: ${missing.join(" ")}`);
  process.exit(1);
}
console.log(`fonts: ${ranges.length} Manrope ranges cover all Kazakh letters (${KAZAKH})`);
