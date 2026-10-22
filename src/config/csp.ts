import { TELEGRAM_WEB_APP_SDK_ORIGIN } from '@/telegram/sdk';

export interface CspOptions {
  /** Per-request nonce; Next.js applies it to its own scripts, we pass it to the Telegram <Script>. */
  readonly nonce: string;
  /** Origin of the backend API, or null if the configuration is invalid. */
  readonly apiOrigin: string | null;
  readonly isDev: boolean;
}

/**
 * Content-Security-Policy for the Mini App (based on the Next.js nonce guide).
 *
 * - script-src: nonce + 'strict-dynamic'; the telegram.org host is a fallback for CSP2-only browsers.
 * - style-src 'unsafe-inline': telegram-web-app.js injects <style> elements without a nonce.
 *   (A nonce in style-src would disable 'unsafe-inline', so it is deliberately not added there.)
 * - frame-src tg:: the SDK opens tg:// links through a hidden iframe on iOS.
 * - connect-src: only our origin and the configured backend.
 * - No frame-ancestors: Telegram Web (web.telegram.org) embeds Mini Apps in an iframe.
 * - No upgrade-insecure-requests: production is HTTPS-only anyway (Telegram requirement), and the directive
 *   breaks plain-HTTP local runs (`docker run` → http://localhost) in WebKit.
 */
export function buildContentSecurityPolicy({ nonce, apiOrigin, isDev }: CspOptions): string {
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      TELEGRAM_WEB_APP_SDK_ORIGIN,
      // React/Next.js dev tooling relies on eval for stack traces and HMR.
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:', 'https:'],
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...(apiOrigin === null ? [] : [apiOrigin])],
    ['frame-src', "'self'", 'tg:'],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
  ];
  return directives.map((parts) => parts.join(' ')).join('; ');
}
