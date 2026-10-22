import { en } from './locales/en';
import { uk, type MessageKey, type Messages } from './locales/uk';

export const SUPPORTED_LOCALES = ['uk', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'uk';

const dictionaries: Readonly<Record<Locale, Messages>> = { uk, en };

export type TranslationParams = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, params?: TranslationParams) => string;

export interface Translator {
  readonly locale: Locale;
  readonly t: Translate;
  readonly formatDateTime: (iso: string) => string;
}

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Picks a supported locale from a language tag such as Telegram's `language_code`
 * ("uk", "en-US") or an Accept-Language header ("en-US,en;q=0.9" → first entry).
 * Unknown languages fall back to Ukrainian.
 */
export function resolveLocale(tag: string | null | undefined): Locale {
  const base =
    tag
      ?.trim()
      .toLowerCase()
      .split(/[-_,;]/)[0] ?? '';
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

export function createTranslator(locale: Locale): Translator {
  const messages = dictionaries[locale];
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const t: Translate = (key, params) => {
    const template = messages[key];
    if (params === undefined) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name];
      return value === undefined ? match : String(value);
    });
  };

  const formatDateTime = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
  };

  return { locale, t, formatDateTime };
}
