'use client';

import { useEffect } from 'react';
import { FatalScreen } from '@/app-shell/FatalScreen';
import { DEFAULT_LOCALE, I18nProvider } from '@/i18n';
import './globals.css';

/** Replaces the root layout when the layout itself fails, so it renders its own <html>/<body>. */
export default function GlobalError({ error }: { readonly error: unknown }) {
  useEffect(() => {
    console.error('[app] Unhandled root error', error);
  }, [error]);

  return (
    <html lang={DEFAULT_LOCALE}>
      <body>
        <I18nProvider locale={DEFAULT_LOCALE}>
          <FatalScreen />
        </I18nProvider>
      </body>
    </html>
  );
}
