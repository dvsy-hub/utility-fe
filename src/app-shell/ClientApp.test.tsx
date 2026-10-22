import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '@/config/env';
import type { TelegramWebApp } from '@/telegram/types';
import { errorResponse, headerOf, okResponse, tokenPayload, urlOf, userPayload } from '@/test/http';
import { ClientApp } from './ClientApp';

const config: AppConfig = {
  apiBaseUrl: 'https://api.test',
  telegramBotUrl: 'https://t.me/utilityhub_bot',
  devInitData: null,
  requestTimeoutMs: 1000,
};

function telegram(languageCode = 'uk'): TelegramWebApp {
  return {
    initData: 'query_id=AAA&auth_date=1760000000&hash=abc',
    initDataUnsafe: { user: { id: 42, first_name: 'Olena', language_code: languageCode } },
    version: '9.0',
    platform: 'android',
    colorScheme: 'light',
    themeParams: { bg_color: '#ffffff' },
    onEvent: vi.fn(),
    offEvent: vi.fn(),
    ready: vi.fn(),
    expand: vi.fn(),
    close: vi.fn(),
    isVersionAtLeast: () => true,
    disableVerticalSwipes: vi.fn(),
  };
}

const areasPage = {
  page: 1,
  size: 100,
  total: 1,
  data: [{ id: 'area-1', name: { uk: 'м. Київ', ru: null, en: 'Kyiv' }, createdAt: '', updatedAt: '' }],
};

/**
 * Backend double for an authenticated session: the auth calls answer in order, while the home screen's
 * independent loads (`GET /v1/areas`, `GET /v1/user-addresses`) are answered by URL.
 */
function backend(...authResponses: Response[]) {
  const queue = [...authResponses];
  return vi.fn<typeof globalThis.fetch>((input) => {
    if (urlOf(input).startsWith('https://api.test/v1/areas')) return Promise.resolve(okResponse(areasPage));
    if (urlOf(input).startsWith('https://api.test/v1/user-addresses?')) {
      return Promise.resolve(okResponse({ page: 1, size: 100, total: 0, data: [] }));
    }
    const next = queue.shift();
    return next === undefined ? Promise.reject(new Error(`unexpected request ${urlOf(input)}`)) : Promise.resolve(next);
  });
}

const signedIn = () => backend(okResponse(tokenPayload('a')), okResponse(userPayload));

/** Renders the real client root; Telegram is simulated through window.Telegram as the SDK would set it. */
function renderApp(webApp: TelegramWebApp | null) {
  if (webApp !== null) vi.stubGlobal('Telegram', { WebApp: webApp });
  return render(<ClientApp config={config} />);
}

describe('ClientApp', () => {
  it('asks to open the app in Telegram when there is no initData', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    // Without Telegram the locale falls back to the browser language (jsdom: en-US).
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('uk-UA');

    renderApp(null);

    expect(await screen.findByRole('heading', { name: 'Відкрийте застосунок у Telegram' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Відкрити в Telegram' })).toHaveAttribute(
      'href',
      'https://t.me/utilityhub_bot',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the loading state, then the home screen with the address search', async () => {
    const fetch = signedIn();
    vi.stubGlobal('fetch', fetch);

    renderApp(telegram());

    expect(screen.getByRole('heading', { name: 'Вхід через Telegram' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Вітаємо, Олена!' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Додати нову адресу' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Мої адреси' })).toBeInTheDocument();
    expect(await screen.findByText('Ще немає адрес')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Область' })).toBeEnabled();
    expect(screen.queryByRole('combobox', { name: 'Місто' })).not.toBeInTheDocument();

    // The address directory is requested with the session's access token.
    await vi.waitFor(() => {
      expect(fetch.mock.calls.some(([url]) => urlOf(url).startsWith('https://api.test/v1/areas?'))).toBe(true);
    });
    const areasCall = fetch.mock.calls.find(([url]) => urlOf(url).startsWith('https://api.test/v1/areas?'));
    expect(headerOf(areasCall?.[1], 'Authorization')).toBe('Bearer access-a');
    const listCall = fetch.mock.calls.find(([url]) => urlOf(url).startsWith('https://api.test/v1/user-addresses?'));
    expect(headerOf(listCall?.[1], 'Authorization')).toBe('Bearer access-a');
  });

  it('localizes the UI from the Telegram language', async () => {
    vi.stubGlobal('fetch', signedIn());

    renderApp(telegram('en'));

    expect(await screen.findByRole('heading', { name: 'Welcome, Олена!' })).toBeInTheDocument();
  });

  it('shows a retryable error and recovers on retry', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      backend(
        errorResponse(503, 'Telegram authentication is not configured'),
        okResponse(tokenPayload('a')),
        okResponse(userPayload),
      ),
    );

    renderApp(telegram());

    expect(await screen.findByRole('alert')).toHaveTextContent('Вхід тимчасово недоступний');
    await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));

    expect(await screen.findByRole('heading', { name: 'Вітаємо, Олена!' })).toBeInTheDocument();
  });

  it('offers only "close" when Telegram rejects the initData', async () => {
    const user = userEvent.setup();
    const webApp = telegram();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(errorResponse(401, 'Invalid Telegram init data')),
    );

    renderApp(webApp);

    expect(await screen.findByRole('alert')).toHaveTextContent('Закрийте та відкрийте застосунок знову');
    expect(screen.queryByRole('button', { name: 'Спробувати ще раз' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(webApp.close).toHaveBeenCalled();
  });

  it('initializes the Telegram container', async () => {
    vi.stubGlobal('fetch', signedIn());
    const webApp = telegram();

    renderApp(webApp);

    await screen.findByRole('heading', { name: 'Вітаємо, Олена!' });
    expect(webApp.ready).toHaveBeenCalled();
    expect(webApp.expand).toHaveBeenCalled();
  });

  it('applies the Telegram dark theme to <html>', async () => {
    vi.stubGlobal('fetch', signedIn());

    renderApp({ ...telegram(), colorScheme: 'dark' });

    await screen.findByRole('heading', { name: 'Вітаємо, Олена!' });
    expect(document.documentElement).toHaveClass('dark');
  });

  it('signs out', async () => {
    const user = userEvent.setup();
    const fetch = backend(okResponse(tokenPayload('a')), okResponse(userPayload), okResponse({ revoked: true }));
    vi.stubGlobal('fetch', fetch);

    renderApp(telegram());
    await user.click(await screen.findByRole('button', { name: 'Вийти' }));

    expect(await screen.findByRole('heading', { name: 'Ви вийшли з акаунта' })).toBeInTheDocument();
    expect(fetch.mock.calls.map(([url]) => urlOf(url))).toContain('https://api.test/v1/auth/logout');
  });
});
