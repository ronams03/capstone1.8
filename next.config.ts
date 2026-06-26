import type { NextConfig } from "next";

const devWatchIgnored = [
  "**/.git/**",
  "**/.next/**",
  "**/node_modules/**",
  "**/vendor/**",
  "**/mcp-servers/**",
  "**/backups/**",
  "**/uploads/**",
  "**/out/**",
  "**/HTML/**",
  "**/temp_capstone1.5/**",
];

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  reactCompiler: true,
  reactStrictMode: true,
  turbopack: {},
  onDemandEntries: {
    // Keep more pages compiled in development so sidebar/button navigation does
    // not repeatedly wait for Next's on-demand page compiler.
    maxInactiveAge: 10 * 60_000,
    pagesBufferLength: 32,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: devWatchIgnored,
      };
    }
    return config;
  },
};

export default nextConfig;
