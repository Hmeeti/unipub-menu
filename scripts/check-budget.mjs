// Usage: node scripts/check-budget.mjs [baseUrl]   (production server must be running)
// Measures the gzip JS a guest downloads on first load of the menu route, split into the
// framework baseline (scripts of an empty page in the same layout) and the menu's own code.
import { gzipSync } from "node:zlib";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ROUTE = "/ru";
const BASELINE_ROUTE = "/ru/__budget_baseline__";
const APP_BUDGET_KB = Number(process.env.JS_APP_BUDGET_KB ?? 45);
const TOTAL_BUDGET_KB = Number(process.env.JS_TOTAL_BUDGET_KB ?? 175);

async function scriptsOf(route) {
  const res = await fetch(new URL(route, BASE));
  const html = await res.text();
  if (route === ROUTE && !res.ok) throw new Error(`GET ${route} → ${res.status}`);
  // `nomodule` scripts (legacy polyfills) are never fetched by browsers that support ES modules.
  return new Set(
    [...html.matchAll(/<script([^>]*)>/g)]
      .filter((m) => !/\bnomodule\b/i.test(m[1]))
      .map((m) => m[1].match(/\bsrc="([^"]+)"/)?.[1])
      .filter((s) => s && s.startsWith("/")),
  );
}

async function gzSize(src) {
  const body = Buffer.from(await (await fetch(new URL(src, BASE))).arrayBuffer());
  return gzipSync(body, { level: 9 }).length / 1024;
}

const page = await scriptsOf(ROUTE);
const baseline = await scriptsOf(BASELINE_ROUTE);

let app = 0;
let framework = 0;
const rows = [];
for (const src of page) {
  const kb = await gzSize(src);
  const own = !baseline.has(src);
  if (own) app += kb;
  else framework += kb;
  rows.push({ name: src.split("/").pop(), kb, own });
}
rows.sort((a, b) => b.kb - a.kb);
for (const r of rows)
  console.log(`${r.kb.toFixed(1).padStart(7)} KB  ${r.own ? "app      " : "framework"}  ${r.name}`);
const total = app + framework;
console.log(
  `\nframework baseline ${framework.toFixed(1)} KB · menu code ${app.toFixed(1)} KB (budget ${APP_BUDGET_KB}) · total ${total.toFixed(1)} KB (budget ${TOTAL_BUDGET_KB})`,
);

if (app > APP_BUDGET_KB || total > TOTAL_BUDGET_KB) {
  console.error("JS budget exceeded");
  process.exit(1);
}
