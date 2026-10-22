import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { ApiClientContext } from '@/shared/api';
import { createHttpClient } from '@/shared/api/http-client';
import { errorResponse, okResponse, savedAddressPayload, urlOf } from '@/test/http';
import { HomeScreen } from './HomeScreen';

const user = { id: 'user-1', firstName: 'Олена', lastName: null, createdAt: null };
const item = (id: string, uk: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: { uk },
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...extra,
});
const page = (data: unknown[]) => ({ page: 1, size: 20, total: data.length, data });

type Route = (url: URL, init: RequestInit | undefined) => Response | undefined;

/** Backend double for the directory and user-address endpoints (shapes from openapi/openapi.json). */
function backend(saved: () => Response, ...extra: Route[]) {
  return vi.fn<typeof globalThis.fetch>((input, init) => {
    const url = new URL(urlOf(input));
    for (const route of extra) {
      const response = route(url, init);
      if (response !== undefined) return Promise.resolve(response);
    }
    const routes: Record<string, () => Response> = {
      '/v1/areas': () => okResponse(page([item('area-1', 'м. Київ')])),
      '/v1/cities': () => okResponse(page([item('city-1', 'Київ', { areaId: 'area-1' })])),
      '/v1/streets': () => okResponse(page([item('street-1', 'вул. Хрещатик', { cityId: 'city-1' })])),
      '/v1/houses': () => okResponse(page([item('house-1', '22', { streetId: 'street-1', hasApartments: true })])),
      '/v1/apartments': () => okResponse(page([item('apt-1', '17', { houseId: 'house-1' })])),
      '/v1/user-addresses': saved,
    };
    const route = routes[url.pathname];
    return route === undefined ? Promise.reject(new Error(`unexpected ${url.pathname}`)) : Promise.resolve(route());
  });
}

function renderHome(fetch: typeof globalThis.fetch) {
  const client = createHttpClient({ baseUrl: 'https://api.test', timeoutMs: 1000, fetch });
  render(
    <I18nProvider locale="uk">
      <ApiClientContext value={client}>
        <HomeScreen user={user} onSignOut={() => Promise.resolve()} />
      </ApiClientContext>
    </I18nProvider>,
  );
  return { user: userEvent.setup() };
}

const savedList = () => screen.getByRole('list', { name: 'Мої адреси' });

async function choose(u: ReturnType<typeof userEvent.setup>, name: string, text: string, option: string) {
  await u.click(screen.getByRole('combobox', { name }));
  await u.type(screen.getByRole('combobox', { name }), text);
  await u.click(await screen.findByRole('option', { name: option }));
}

describe('HomeScreen', () => {
  it('loads the saved addresses after login', async () => {
    const fetch = backend(() =>
      okResponse({
        page: 1,
        size: 100,
        total: 2,
        data: [savedAddressPayload('s1', true), savedAddressPayload('s2', false)],
      }),
    );
    renderHome(fetch);

    expect(screen.getByText('Завантажуємо ваші адреси…')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Мої адреси' })).toBeInTheDocument();
    const items = within(savedList()).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'м. Київ, Київ, вул. Хрещатик, буд. 22, кв. 17',
      'м. Київ, Київ, вул. Хрещатик, буд. 22',
    ]);
    expect(fetch.mock.calls.some(([url]) => urlOf(url) === 'https://api.test/v1/user-addresses?page=1&size=100')).toBe(
      true,
    );
  });

  it('shows the empty state, then lists the first added address without a reload', async () => {
    let listCalls = 0;
    const fetch = backend(
      () => {
        listCalls += 1;
        return okResponse({ page: 1, size: 100, total: 0, data: [] });
      },
      (url, init) =>
        url.pathname === '/v1/user-addresses' && init?.method === 'POST'
          ? okResponse(savedAddressPayload('new-1', true))
          : undefined,
    );
    const { user: u } = renderHome(fetch);

    expect(await screen.findByText('Ще немає адрес')).toBeInTheDocument();
    expect(screen.getByText('Додайте першу адресу нижче - вона зʼявиться тут.')).toBeInTheDocument();

    await choose(u, 'Область', 'Київ', 'м. Київ');
    await choose(u, 'Місто', 'Київ', 'Київ');
    await choose(u, 'Вулиця', 'Хре', 'вул. Хрещатик');
    await choose(u, 'Будинок', '22', '22');
    await choose(u, 'Квартира', '17', '17');
    await u.click(screen.getByRole('button', { name: 'Додати адресу' }));

    expect(await screen.findByRole('list', { name: 'Мої адреси' })).toHaveTextContent(
      'м. Київ, Київ, вул. Хрещатик, буд. 22, кв. 17',
    );
    const post = fetch.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(urlOf(post?.[0])).toBe('https://api.test/v1/user-addresses');
    expect(post?.[1]?.body).toBe('{"type":"apartment","addressId":"apt-1"}');
    expect(listCalls).toBe(1); // updated from the POST response, not by reloading
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('does not list an already saved address twice', async () => {
    const fetch = backend(
      () => okResponse({ page: 1, size: 100, total: 1, data: [savedAddressPayload('s1', true)] }),
      (url, init) =>
        url.pathname === '/v1/user-addresses' && init?.method === 'POST'
          ? okResponse(savedAddressPayload('s1', true)) // backend returns the existing address
          : undefined,
    );
    const { user: u } = renderHome(fetch);
    await screen.findByRole('list', { name: 'Мої адреси' });

    await choose(u, 'Область', 'Київ', 'м. Київ');
    await choose(u, 'Місто', 'Київ', 'Київ');
    await choose(u, 'Вулиця', 'Хре', 'вул. Хрещатик');
    await choose(u, 'Будинок', '22', '22');
    await choose(u, 'Квартира', '17', '17');
    await u.click(screen.getByRole('button', { name: 'Додати адресу' }));

    expect(await screen.findByText(/^Ця адреса вже є у вашому списку/)).toBeInTheDocument();
    expect(within(savedList()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('shows a list error and retries', async () => {
    let attempt = 0;
    const fetch = backend(() => {
      attempt += 1;
      return attempt === 1
        ? errorResponse(500, 'Internal server error')
        : okResponse({ page: 1, size: 100, total: 1, data: [savedAddressPayload('s1', false)] });
    });
    const { user: u } = renderHome(fetch);

    expect(await screen.findByText('Не вдалося завантажити ваші адреси.')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));

    expect(await screen.findByRole('list', { name: 'Мої адреси' })).toHaveTextContent('буд. 22');
  });
});
