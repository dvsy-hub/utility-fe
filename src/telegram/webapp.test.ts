import { describe, expect, it, vi } from 'vitest';
import type { TelegramWebApp } from './types';
import { getWebApp, prepareTelegramShell, readLaunchContext } from './webapp';

function fakeWebApp(overrides: Partial<TelegramWebApp> = {}): TelegramWebApp {
  return {
    initData: 'query_id=AAA&auth_date=1760000000&hash=abc',
    initDataUnsafe: { user: { id: 42, first_name: 'Olena', language_code: 'en' } },
    version: '9.0',
    platform: 'ios',
    colorScheme: 'light',
    themeParams: {},
    onEvent: vi.fn(),
    offEvent: vi.fn(),
    ready: vi.fn(),
    expand: vi.fn(),
    close: vi.fn(),
    isVersionAtLeast: vi.fn(() => true),
    disableVerticalSwipes: vi.fn(),
    ...overrides,
  };
}

describe('readLaunchContext', () => {
  it('uses the raw initData string inside Telegram', () => {
    const context = readLaunchContext(fakeWebApp(), null);

    expect(context).toEqual({
      source: 'telegram',
      initData: 'query_id=AAA&auth_date=1760000000&hash=abc',
      hintUserId: 42,
      hintLanguageCode: 'en',
      platform: 'ios',
      version: '9.0',
    });
  });

  it('returns null outside Telegram (SDK present, initData empty)', () => {
    expect(readLaunchContext(fakeWebApp({ initData: '', initDataUnsafe: {} }), null)).toBeNull();
  });

  it('returns null when the SDK did not load', () => {
    expect(readLaunchContext(null, null)).toBeNull();
  });

  it('prefers real Telegram initData over the dev override', () => {
    expect(readLaunchContext(fakeWebApp(), 'dev=1')?.source).toBe('telegram');
  });

  it('uses the dev override only when there is no Telegram initData', () => {
    const devInitData = `user=${encodeURIComponent(JSON.stringify({ id: 7, language_code: 'uk' }))}&hash=x`;

    expect(readLaunchContext(null, devInitData)).toMatchObject({
      source: 'dev-override',
      initData: devInitData,
      hintUserId: 7,
      hintLanguageCode: 'uk',
    });
  });

  it('tolerates a malformed dev override', () => {
    expect(readLaunchContext(null, 'user=%7Bbroken')).toMatchObject({ hintUserId: null });
  });
});

describe('getWebApp', () => {
  it('reads window.Telegram.WebApp', () => {
    const webApp = fakeWebApp();
    vi.stubGlobal('Telegram', { WebApp: webApp });
    expect(getWebApp()).toBe(webApp);
  });

  it('returns null without the SDK', () => {
    expect(getWebApp({} as Window)).toBeNull();
  });
});

describe('prepareTelegramShell', () => {
  it('signals readiness and expands the app', () => {
    const webApp = fakeWebApp();
    prepareTelegramShell(webApp);
    expect(webApp.ready).toHaveBeenCalled();
    expect(webApp.expand).toHaveBeenCalled();
    expect(webApp.disableVerticalSwipes).toHaveBeenCalled();
  });

  it('skips APIs the client does not support', () => {
    const webApp = fakeWebApp({ isVersionAtLeast: vi.fn(() => false) });
    prepareTelegramShell(webApp);
    expect(webApp.disableVerticalSwipes).not.toHaveBeenCalled();
  });
});
