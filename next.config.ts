import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  deploymentId: process.env.DEPLOYMENT_VERSION || undefined,
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
};

export default nextConfig;
