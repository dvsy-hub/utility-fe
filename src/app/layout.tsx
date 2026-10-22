import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { I18nProvider, resolveLocale } from '@/i18n';
import { TELEGRAM_WEB_APP_SDK_URL } from '@/telegram/sdk';
import './globals.css';

export const metadata: Metadata = {
  title: 'UtilityHub',
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get('x-nonce');
  // Server-side guess for the first paint; the client switches to Telegram's language_code.
  const locale = resolveLocale(requestHeaders.get('accept-language'));

  return (
    // telegram-web-app.js writes --tg-* CSS variables onto <html> before hydration.
    <html lang={locale} suppressHydrationWarning>
      <body>
        {/* Official SDK: injected into <head> and executed before hydration, so
            window.Telegram.WebApp exists when the client app starts. */}
        <Script src={TELEGRAM_WEB_APP_SDK_URL} strategy="beforeInteractive" {...(nonce === null ? {} : { nonce })} />
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
