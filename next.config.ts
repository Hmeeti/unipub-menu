import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/** Backend: Next server with API, admin, bot webhook. Default target. */
const serverConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  deploymentId: process.env.DEPLOYMENT_VERSION || undefined,
  experimental: {
    // photo uploads in the admin (8 MB file + multipart overhead)
    serverActions: { bodySizeLimit: "9mb" },
  },
  serverExternalPackages: [
    "@electric-sql/pglite",
    "pino",
    "sharp",
    "@node-rs/argon2",
    "postgres",
    "ioredis",
  ],
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*", "./legacy/menu-data.js"],
  },
  images: {
    loader: "custom",
    loaderFile: "./src/lib/images/loader.ts",
    deviceSizes: [320, 480, 640, 960, 1280],
    imageSizes: [96, 160, 240],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

/**
 * Guest menu only, as static files for GitHub Pages (https://hmeeti.github.io/unipub-menu/).
 * Only `*.pages.tsx` files are routes here, so the server pages, route handlers, proxy and
 * instrumentation stay out of the export.
 */
const BASE_PATH = "/unipub-menu";
const pagesConfig: NextConfig = {
  output: "export",
  basePath: BASE_PATH,
  assetPrefix: `${BASE_PATH}/`,
  trailingSlash: true,
  pageExtensions: ["pages.tsx", "pages.ts"],
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  // Typed routes of this target omit the server pages, which then fail to type-check here;
  // `npm run typecheck` (server target, all files) is the type gate.
  typescript: { ignoreBuildErrors: true },
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: "1",
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
};

export default withNextIntl(process.env.BUILD_TARGET === "pages" ? pagesConfig : serverConfig);
