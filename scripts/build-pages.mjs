/** Static guest menu for GitHub Pages: menu snapshot → `next build` (export) → out/ extras. */
import { execSync } from "node:child_process";

const env = { ...process.env, BUILD_TARGET: "pages" };
const run = (cmd) => execSync(cmd, { stdio: "inherit", env });

run("npx tsx scripts/menu-snapshot.ts");
run("npx next build");
run("node scripts/pages-postbuild.mjs");
