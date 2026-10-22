/**
 * Typed, validated application configuration.
 *
 * Values are read from the server environment at request time (see runtime-config.ts)
 * and passed to the client, so one build/image works for every environment.
 * Everything here ends up in the browser — never put secrets (bot token, API keys) here.
 */

export interface AppConfig {
  /** Backend origin (+ optional path prefix) without a trailing slash, e.g. `https://api.example.com`. */
  readonly apiBaseUrl: string;
  /** Optional deep link to the bot / Mini App, shown when the app is opened outside Telegram. */
  readonly telegramBotUrl: string | null;
  /**
   * Development-only: a real `initData` string copied from a Telegram session,
   * used when the app is opened in a regular browser. Always `null` outside development.
   */
  readonly devInitData: string | null;
  readonly requestTimeoutMs: number;
}

export interface RawEnv {
  readonly API_BASE_URL?: string | undefined;
  readonly TELEGRAM_BOT_URL?: string | undefined;
  readonly DEV_INIT_DATA?: string | undefined;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

const DEFAULT_TIMEOUT_MS = 15_000;

function parseUrl(name: string, value: string, { allowHttp }: { allowHttp: boolean }): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} must be an absolute URL, got "${value}".`);
  }
  const httpAllowed = allowHttp && url.protocol === 'http:';
  if (url.protocol !== 'https:' && !httpAllowed) {
    throw new ConfigError(`${name} must use https:// (Telegram Mini Apps require HTTPS).`);
  }
  if (url.search !== '' || url.hash !== '') {
    throw new ConfigError(`${name} must not contain a query string or fragment.`);
  }
  return url;
}

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function parseConfig(env: RawEnv, { isDev }: { isDev: boolean }): AppConfig {
  const rawApiUrl = optional(env.API_BASE_URL);
  if (rawApiUrl === null) {
    throw new ConfigError('API_BASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  }
  // Plain http is tolerated only in development (e.g. a backend on localhost).
  const apiUrl = parseUrl('API_BASE_URL', rawApiUrl, { allowHttp: isDev });

  const rawBotUrl = optional(env.TELEGRAM_BOT_URL);
  const telegramBotUrl = rawBotUrl === null ? null : parseUrl('TELEGRAM_BOT_URL', rawBotUrl, { allowHttp: false }).href;

  return {
    apiBaseUrl: apiUrl.href.replace(/\/+$/, ''),
    telegramBotUrl,
    devInitData: isDev ? optional(env.DEV_INIT_DATA) : null,
    requestTimeoutMs: DEFAULT_TIMEOUT_MS,
  };
}
