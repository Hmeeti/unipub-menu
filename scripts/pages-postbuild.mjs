/**
 * Finishes the static export in out/ for GitHub Pages (https://hmeeti.github.io/unipub-menu/).
 *
 * The first site registered /unipub-menu/sw.js (cache "unipub-v29") and keeps serving its cached
 * copy to returning guests. Browsers re-check that script on every visit, so the new one has to
 * live at the same path: it activates at once, drops every old cache and reloads open tabs.
 * Old asset URLs (js/app.js?v=29 …) get small stubs instead of 404s.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const BASE = "/unipub-menu";
const VERSION = process.env.GITHUB_SHA?.slice(0, 12) || `local-${Date.now()}`;

if (!existsSync(path.join(OUT, "index.html"))) {
  console.error("out/index.html is missing — run the static build first");
  process.exit(1);
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

write(
  "sw.js",
  `/* UNIPUB ${VERSION}: retires the cache of the first site. No fetch handler: the network decides. */
const CURRENT = "unipub-next-${VERSION}";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const stale = (await caches.keys()).filter((key) => key !== CURRENT);
      await Promise.all(stale.map((key) => caches.delete(key)));
      await self.clients.claim();
      if (!stale.length) return;
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(tabs.map((tab) => tab.navigate(tab.url).catch(() => undefined)));
    })(),
  );
});
`,
);

write(".nojekyll", "");

write(
  "manifest.webmanifest",
  JSON.stringify(
    {
      name: "UNIPUB Menu",
      short_name: "UNIPUB",
      description: "Электронное меню UNIPUB — Karaoke Bar & Restaurant, Taraz",
      id: `${BASE}/`,
      start_url: `${BASE}/`,
      scope: `${BASE}/`,
      display: "standalone",
      theme_color: "#050508",
      background_color: "#050508",
      lang: "ru",
      icons: [
        {
          src: `${BASE}/assets/favicon.svg`,
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
    },
    null,
    2,
  ),
);

// Installed copies of the first site start at ./index.html — it is the new root page now.
// A stale HTML page that still loads the old app script is sent to the new menu once.
const toNewSite = `(function(){try{if(sessionStorage.getItem("unipub-moved"))return;sessionStorage.setItem("unipub-moved","1")}catch(e){}
location.replace("${BASE}/"+location.search+location.hash);})();
`;
write("js/app.js", toNewSite);
for (const name of ["menu-data.js", "search.js", "languages.js", "translate.js", "i18n.js"]) {
  write(`js/${name}`, "/* moved: the menu now lives at /unipub-menu/ */\n");
}
write("css/style.css", "/* moved: the menu now lives at /unipub-menu/ */\n");
write("data/menu.json", JSON.stringify({ moved: `${BASE}/` }));

console.log(`pages postbuild: sw.js (${VERSION}), manifest, .nojekyll, legacy stubs`);
