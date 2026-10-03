// Bundles the worker and maintenance scripts into dist/*.mjs for the production image,
// where only the traced standalone node_modules exist. Native modules stay external.
import { build } from "esbuild";

const entries = {
  worker: "worker/index.ts",
  migrate: "scripts/migrate.ts",
  seed: "scripts/seed.ts",
  "create-admin": "scripts/create-admin.ts",
};

await build({
  entryPoints: entries,
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  sourcemap: true,
  external: ["@node-rs/argon2", "sharp", "@electric-sql/pglite", "pino-pretty"],
  alias: { "@": "./src" },
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});
