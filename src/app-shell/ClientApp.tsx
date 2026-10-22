'use client';

import { useEffect, useState } from 'react';
import type { AppConfig } from '@/config/env';
import { AuthProvider } from '@/features/auth';
import { I18nProvider } from '@/i18n';
import { ApiClientContext } from '@/shared/api';
import { configureValidationLocale } from '@/shared/forms';
import { bindColorScheme } from '@/telegram/theme';
import { getWebApp, prepareTelegramShell } from '@/telegram/webapp';
import { AuthGate } from './AuthGate';
import { createAppServices } from './services';

/** Browser-only root: wires Telegram → auth → API and renders the auth gate. */
export function ClientApp({ config }: { readonly config: AppConfig }) {
  // Created once per page load; this component never renders on the server.
  const [services] = useState(() => createAppServices(config, getWebApp()));

  useEffect(() => {
    configureValidationLocale(services.locale);
  }, [services.locale]);

  useEffect(() => {
    // Apply the Telegram light/dark scheme before ready() hides Telegram's placeholder.
    const unbindTheme = bindColorScheme(services.webApp);
    if (services.webApp !== null) prepareTelegramShell(services.webApp);
    return unbindTheme;
  }, [services]);

  return (
    <I18nProvider locale={services.locale}>
      <ApiClientContext value={services.apiClient}>
        <AuthProvider controller={services.auth}>
          <AuthGate webApp={services.webApp} botUrl={config.telegramBotUrl} />
        </AuthProvider>
      </ApiClientContext>
    </I18nProvider>
  );
}
