import type { NextConfig } from "next";
// Forced restart trigger 001

const isOneclickLocalProd = process.env.ONECLICK_LOCAL_PROD === "1";

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development" || isOneclickLocalProd,
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  // @ts-ignore: Turbopack config is needed to silence Vercel build errors with custom webpack
  turbopack: {},
  experimental: {
    cpus: 1,
    workerThreads: isOneclickLocalProd ? false : undefined,
    webpackBuildWorker: isOneclickLocalProd ? false : undefined,
    serverActions: {
      bodySizeLimit: '10mb',
      allowedOrigins: ["localhost:3000", "0.0.0.0:3000", "100.77.151.127:3000", "127.0.0.1:3000"],
    },
  },
  typescript: {
    ignoreBuildErrors: process.env.LOCAL_START_SKIP_TYPECHECK === '1',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ddragon.leagueoflegends.com',
      },
      {
        protocol: 'https',
        hostname: 'am-a.akamaihd.net',
      },

      {
        protocol: 'https',
        hostname: 'static.wikia.nocookie.net',
      },
      {
        protocol: 'https',
        hostname: 'bbibilxlkjcrscyvzzgq.supabase.co',
      },
    ],
    localPatterns: [
      {
        pathname: '/**',
      },
    ],
    minimumCacheTTL: 2678400,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*',
      },
    ];
  },
};

export default (isOneclickLocalProd ? nextConfig : withPWA(nextConfig));




