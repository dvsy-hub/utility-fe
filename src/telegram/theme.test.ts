import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindColorScheme, resolveColorScheme } from './theme';
import type { TelegramThemeParams, TelegramWebApp } from './types';

function fakeWebApp(colorScheme: 'light' | 'dark', themeParams: TelegramThemeParams = { bg_color: '#ffffff' }) {
  const handlers = new Set<() => void>();
  const webApp = {
    colorScheme,
    themeParams,
    onEvent: vi.fn((_event: string, handler: () => void) => handlers.add(handler)),
    offEvent: vi.fn((_event: string, handler: () => void) => handlers.delete(handler)),
  };
  const emitThemeChanged = (next: 'light' | 'dark'): void => {
    webApp.colorScheme = next;
    for (const handler of handlers) handler();
  };
  return { webApp: webApp as unknown as TelegramWebApp, emitThemeChanged, handlers };
}

function stubSystemPreference(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: prefersDark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  return {
    change(next: boolean) {
      media.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

const root = () => document.documentElement;

describe('Telegram color scheme', () => {
  afterEach(() => {
    root().classList.remove('dark');
    root().style.colorScheme = '';
  });

  it('follows Telegram when the client provides a theme', () => {
    expect(resolveColorScheme(fakeWebApp('dark').webApp, false)).toBe('dark');
    expect(resolveColorScheme(fakeWebApp('light').webApp, true)).toBe('light');
  });

  it('falls back to the OS preference outside Telegram', () => {
    expect(resolveColorScheme(null, true)).toBe('dark');
    expect(resolveColorScheme(fakeWebApp('light', {}).webApp, true)).toBe('dark');
  });

  it('toggles the .dark class on <html> and reacts to themeChanged', () => {
    stubSystemPreference(false);
    const { webApp, emitThemeChanged, handlers } = fakeWebApp('dark');

    const unbind = bindColorScheme(webApp);
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().style.colorScheme).toBe('dark');

    emitThemeChanged('light');
    expect(root().classList.contains('dark')).toBe(false);

    unbind();
    expect(handlers.size).toBe(0);
  });

  it('tracks OS changes outside Telegram', () => {
    const system = stubSystemPreference(false);
    const unbind = bindColorScheme(null);
    expect(root().classList.contains('dark')).toBe(false);

    system.change(true);
    expect(root().classList.contains('dark')).toBe(true);
    unbind();
  });
});
