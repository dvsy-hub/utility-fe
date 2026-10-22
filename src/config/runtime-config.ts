import { ConfigError, parseConfig, type AppConfig } from './env';

export type RuntimeConfigResult =
  { readonly ok: true; readonly config: AppConfig } | { readonly ok: false; readonly error: string };

/**
 * Reads configuration from the server environment at request time.
 * Server-side only (page.tsx, proxy.ts): `process.env` is not available in the browser.
 */
export function readRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeConfigResult {
  try {
    const config = parseConfig(
      { API_BASE_URL: env.API_BASE_URL, TELEGRAM_BOT_URL: env.TELEGRAM_BOT_URL, DEV_INIT_DATA: env.DEV_INIT_DATA },
      { isDev: env.NODE_ENV === 'development' },
    );
    return { ok: true, config };
  } catch (error) {
    if (error instanceof ConfigError) return { ok: false, error: error.message };
    throw error;
  }
}
