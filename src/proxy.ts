import { NextResponse, type NextRequest } from 'next/server';
import { buildContentSecurityPolicy } from '@/config/csp';
import { readRuntimeConfig } from '@/config/runtime-config';

/**
 * Per-request CSP with a nonce (https://nextjs.org/docs/app/guides/content-security-policy).
 * The nonce travels to the app via the `x-nonce` request header; Next.js applies it to its own
 * scripts and the root layout passes it to the Telegram SDK <Script>.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const runtime = readRuntimeConfig();
  const csp = buildContentSecurityPolicy({
    nonce,
    apiOrigin: runtime.ok ? new URL(runtime.config.apiBaseUrl).origin : null,
    isDev: process.env.NODE_ENV === 'development',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: skip API routes, build assets and prefetches.
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
