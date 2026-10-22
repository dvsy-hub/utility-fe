/**
 * Minimal typings for the subset of the official Telegram Web Apps SDK
 * (https://telegram.org/js/telegram-web-app.js) that this app uses.
 *
 * Reference: https://core.telegram.org/bots/webapps#initializing-mini-apps
 * Extend this interface when a feature needs another SDK method.
 */

export interface TelegramWebAppUser {
  readonly id: number;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly language_code?: string;
  readonly is_premium?: boolean;
  readonly photo_url?: string;
}

/**
 * Parsed `initData`. NOT trustworthy: it is not verified on the client and may be
 * forged by anyone who opens the page. Use only for non-security UI hints.
 */
export interface TelegramWebAppInitDataUnsafe {
  readonly query_id?: string;
  readonly user?: TelegramWebAppUser;
  readonly auth_date?: number;
  readonly start_param?: string;
  readonly chat_type?: string;
}

/** Colors of the user's Telegram theme (also exposed as --tg-theme-* CSS variables by the SDK). */
export interface TelegramThemeParams {
  readonly bg_color?: string;
  readonly text_color?: string;
  readonly hint_color?: string;
  readonly link_color?: string;
  readonly button_color?: string;
  readonly button_text_color?: string;
  readonly secondary_bg_color?: string;
  readonly header_bg_color?: string;
  readonly bottom_bar_bg_color?: string;
  readonly accent_text_color?: string;
  readonly section_bg_color?: string;
  readonly section_header_text_color?: string;
  readonly section_separator_color?: string;
  readonly subtitle_text_color?: string;
  readonly destructive_text_color?: string;
}

export type TelegramEventType = 'themeChanged' | 'viewportChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged';

export interface TelegramWebApp {
  /** Raw, signed query string. The only value the backend can verify. */
  readonly initData: string;
  readonly initDataUnsafe: TelegramWebAppInitDataUnsafe;
  /** Bot API version supported by the Telegram client, e.g. "8.0". */
  readonly version: string;
  /** "android" | "ios" | "tdesktop" | "macos" | "weba" | "webk" | "unknown" | … */
  readonly platform: string;
  readonly colorScheme: 'light' | 'dark';
  readonly themeParams: TelegramThemeParams;
  onEvent(eventType: TelegramEventType, handler: () => void): void;
  offEvent(eventType: TelegramEventType, handler: () => void): void;
  ready(): void;
  expand(): void;
  close(): void;
  requestFullscreen(): void;
  isVersionAtLeast(version: string): boolean;
  /** Bot API 7.7+. */
  disableVerticalSwipes(): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
