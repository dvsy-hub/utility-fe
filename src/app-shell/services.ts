import type { AppConfig } from '@/config/env';
import {
  AuthController,
  TokenManager,
  createAuthApi,
  createSessionStore,
  fetchCurrentUser,
  getSessionStorage,
  sessionOwnerKey,
} from '@/features/auth';
import { resolveLocale, type Locale } from '@/i18n';
import { createHttpClient, type HttpClient } from '@/shared/api';
import type { TelegramWebApp } from '@/telegram/types';
import { readLaunchContext } from '@/telegram/webapp';

export interface AppServices {
  readonly config: AppConfig;
  readonly webApp: TelegramWebApp | null;
  readonly locale: Locale;
  /** Authenticated client for feature code. */
  readonly apiClient: HttpClient;
  readonly auth: AuthController;
}

/**
 * Composition root: the only place where modules are wired together.
 *
 *   telegram ──initData──▶ auth (TokenManager, AuthController) ──tokens──▶ shared/api (HttpClient)
 */
export function createAppServices(config: AppConfig, webApp: TelegramWebApp | null): AppServices {
  const launch = readLaunchContext(webApp, config.devInitData);
  const locale = resolveLocale(launch?.hintLanguageCode ?? navigator.language);

  // Auth endpoints carry credentials in the body, so they use a client without token handling.
  const publicClient = createHttpClient({ baseUrl: config.apiBaseUrl, timeoutMs: config.requestTimeoutMs });

  const tokens = new TokenManager({
    api: createAuthApi(publicClient),
    store: createSessionStore(getSessionStorage()),
    owner: sessionOwnerKey(launch?.hintUserId ?? null),
  });

  const apiClient = createHttpClient({
    baseUrl: config.apiBaseUrl,
    timeoutMs: config.requestTimeoutMs,
    auth: tokens,
  });

  const auth = new AuthController({
    launch,
    tokens,
    fetchCurrentUser: () => fetchCurrentUser(apiClient),
  });

  return { config, webApp, locale, apiClient, auth };
}
