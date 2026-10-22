import type { TelegramWebApp } from './types';

/**
 * Everything the rest of the app needs to know about how it was launched.
 *
 * `initData` is the raw signed string that must be sent to the backend.
 * `hint*` fields come from unverified data and MUST NOT be used for authorization
 * decisions — only for UI defaults (language) and cache partitioning.
 */
export interface LaunchContext {
  readonly source: 'telegram' | 'dev-override';
  readonly initData: string;
  readonly hintUserId: number | null;
  readonly hintLanguageCode: string | null;
  readonly platform: string;
  readonly version: string | null;
}

/** Returns the SDK object injected by telegram-web-app.js, or `null` if the script did not load. */
export function getWebApp(win: Window = window): TelegramWebApp | null {
  return win.Telegram?.WebApp ?? null;
}

interface InitDataUserHint {
  readonly id: number | null;
  readonly languageCode: string | null;
}

/** Extracts non-authoritative hints from a raw initData string (used only for the dev override). */
function readUserHint(initData: string): InitDataUserHint {
  try {
    const rawUser = new URLSearchParams(initData).get('user');
    if (rawUser === null) return { id: null, languageCode: null };
    const user: unknown = JSON.parse(rawUser);
    if (typeof user !== 'object' || user === null) return { id: null, languageCode: null };
    const { id, language_code: languageCode } = user as Record<string, unknown>;
    return {
      id: typeof id === 'number' ? id : null,
      languageCode: typeof languageCode === 'string' ? languageCode : null,
    };
  } catch {
    return { id: null, languageCode: null };
  }
}

/**
 * Determines whether the app runs inside Telegram.
 *
 * Outside Telegram the SDK object still exists, but `initData` is an empty string,
 * so the presence of `initData` — not of `window.Telegram` — is the signal.
 * Returns `null` when there is nothing to authenticate with.
 */
export function readLaunchContext(webApp: TelegramWebApp | null, devInitData: string | null): LaunchContext | null {
  if (webApp !== null && webApp.initData !== '') {
    const user = webApp.initDataUnsafe.user;
    return {
      source: 'telegram',
      initData: webApp.initData,
      hintUserId: user?.id ?? null,
      hintLanguageCode: user?.language_code ?? null,
      platform: webApp.platform,
      version: webApp.version,
    };
  }

  if (devInitData !== null) {
    const hint = readUserHint(devInitData);
    return {
      source: 'dev-override',
      initData: devInitData,
      hintUserId: hint.id,
      hintLanguageCode: hint.languageCode,
      platform: 'browser',
      version: null,
    };
  }

  return null;
}

/**
 * Signals readiness to the Telegram client and configures the container.
 * Safe to call more than once (e.g. React StrictMode, HMR).
 */
export function prepareTelegramShell(webApp: TelegramWebApp): void {
  try {
    webApp.ready();
    webApp.expand();
    if (webApp.platform === 'android' || webApp.platform === 'ios') {
      webApp.requestFullscreen()
    }
    if (webApp.isVersionAtLeast('7.7')) {
      // Prevents accidental "swipe down to close" while scrolling content.
      webApp.disableVerticalSwipes();
    }
  } catch (error) {
    // Never block the app on cosmetic container calls.
    console.warn('[telegram] Failed to prepare the Mini App container', error);
  }
}

export function closeMiniApp(webApp: TelegramWebApp | null): void {
  webApp?.close();
}
