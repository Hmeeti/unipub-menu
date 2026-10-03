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

const nextConfig: NextConfig = {
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

export default withNextIntl(nextConfig);
