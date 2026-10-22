import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained Node server in .next/standalone (see Dockerfile).
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Type checking runs with TypeScript 7 (`pnpm typecheck`, also part of `pnpm build`).
  // Next's own checker would resolve the `typescript` package, which here is the TS 6 API
  // shim used by typescript-eslint and openapi-typescript — so it is skipped to avoid a second,
  // different compiler run.
  typescript: { ignoreBuildErrors: true },
  // Let `next dev` serve its dev resources (HMR, dev chunks) to Telegram through a tunnel.
  // Other tunnel hosts: DEV_ALLOWED_ORIGINS=my.tunnel.example,*.other.dev pnpm dev
  allowedDevOrigins: [
    '*.trycloudflare.com',
    '*.ngrok-free.app',
    '*.ngrok-free.dev',
    '*.ngrok.app',
    '*.ngrok.dev',
    ...(process.env.DEV_ALLOWED_ORIGINS?.split(',').map((host) => host.trim()) ?? []),
  ],
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]);
  },
};

export default nextConfig;
