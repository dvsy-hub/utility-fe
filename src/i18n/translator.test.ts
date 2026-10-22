import { describe, expect, it } from 'vitest';
import { en } from './locales/en';
import { uk } from './locales/uk';
import { createTranslator, resolveLocale } from './translator';

describe('i18n', () => {
  it('defaults to Ukrainian and maps Telegram language codes', () => {
    expect(resolveLocale('uk')).toBe('uk');
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('de')).toBe('uk');
    expect(resolveLocale(null)).toBe('uk');
    expect(resolveLocale('en-US,en;q=0.9,uk;q=0.8')).toBe('en');
    expect(resolveLocale('uk,en;q=0.9')).toBe('uk');
  });

  it('interpolates parameters', () => {
    expect(createTranslator('uk').t('auth.success.greeting', { name: 'Олена' })).toBe('Вітаємо, Олена!');
    expect(createTranslator('en').t('auth.success.greeting', { name: 'Olena' })).toBe('Welcome, Olena!');
  });

  it('keeps every locale complete and non-empty', () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(Object.keys(en).sort(byName)).toEqual(Object.keys(uk).sort(byName));
    for (const value of [...Object.values(uk), ...Object.values(en)]) expect(value.trim()).not.toBe('');
  });

  it('formats dates and passes through invalid input', () => {
    const { formatDateTime } = createTranslator('uk');
    expect(formatDateTime('2026-10-17T21:08:57.457Z')).toMatch(/2026/);
    expect(formatDateTime('nope')).toBe('nope');
  });
});
