import { config } from 'zod';
import { en, uk } from 'zod/locales';
import type { Locale } from '@/i18n';

const zodLocales = { uk, en } as const satisfies Record<Locale, () => Parameters<typeof config>[0]>;

/**
 * Localizes zod's built-in validation messages (used by react-hook-form via zodResolver).
 * Global setting: call once when the app locale is known. Custom messages passed to schema
 * rules (e.g. `.min(3, t('…'))`) still take precedence.
 */
export function configureValidationLocale(locale: Locale): void {
  config(zodLocales[locale]());
}
