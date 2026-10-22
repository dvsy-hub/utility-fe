import type { TelegramWebApp } from './types';

export type ColorScheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Telegram decides light/dark inside the client. Outside Telegram (or if the client sent no
 * theme) the SDK reports "light" by default, so the OS preference is used instead.
 */
export function resolveColorScheme(webApp: TelegramWebApp | null, systemPrefersDark: boolean): ColorScheme {
  if (webApp?.themeParams.bg_color !== undefined) return webApp.colorScheme;
  return systemPrefersDark ? 'dark' : 'light';
}

/** Toggles the `.dark` class used by Tailwind's `dark:` variant and the shadcn/ui tokens. */
export function applyColorScheme(scheme: ColorScheme, root: HTMLElement): void {
  root.classList.toggle('dark', scheme === 'dark');
  root.style.colorScheme = scheme;
}

/**
 * Keeps <html> in sync with the Telegram theme (`themeChanged`) or the OS preference.
 * Colors themselves come from the --tg-theme-* variables the SDK maintains (see globals.css);
 * this only switches the light/dark fallbacks and `dark:` styles. Returns an unsubscribe function.
 */
export function bindColorScheme(webApp: TelegramWebApp | null, win: Window = window): () => void {
  const media = typeof win.matchMedia === 'function' ? win.matchMedia(DARK_QUERY) : null;
  const update = (): void => {
    applyColorScheme(resolveColorScheme(webApp, media?.matches ?? false), win.document.documentElement);
  };

  update();
  webApp?.onEvent('themeChanged', update);
  media?.addEventListener('change', update);

  return () => {
    webApp?.offEvent('themeChanged', update);
    media?.removeEventListener('change', update);
  };
}
