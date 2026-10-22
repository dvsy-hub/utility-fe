import { describe, expect, it, vi } from 'vitest';
import { InvalidResponseError } from '@/shared/api/errors';
import { createHttpClient } from '@/shared/api/http-client';
import { okResponse, urlOf } from '@/test/http';
import { createAddressApi, localizedName } from './api';

const signal = new AbortController().signal;

function setup(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(okResponse(data));
  const api = createAddressApi(createHttpClient({ baseUrl: 'https://api.test', timeoutMs: 1000, fetch }));
  const requestedUrl = (): URL => new URL(urlOf(fetch.mock.calls[0]?.[0]));
  return { api, requestedUrl };
}

// Item shape as documented in openapi/openapi.json (CityItemDto, HouseItemDto, …).
const item = (id: string, uk: string, en: string | null = null) => ({
  id,
  name: { uk, ru: null, en },
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
});

describe('createAddressApi', () => {
  it('loads all areas in one page', async () => {
    const { api, requestedUrl } = setup({ page: 1, size: 100, total: 1, data: [item('a1', 'м. Київ', 'Kyiv')] });

    await expect(api.listAreas(signal)).resolves.toEqual({
      items: [{ id: 'a1', name: { uk: 'м. Київ', ru: null, en: 'Kyiv' } }],
      total: 1,
    });
    expect(requestedUrl().pathname).toBe('/v1/areas');
    expect(requestedUrl().searchParams.get('size')).toBe('100');
  });

  it.each([
    ['searchCities', '/v1/cities', 'areaId'],
    ['searchStreets', '/v1/streets', 'cityId'],
    ['searchApartments', '/v1/apartments', 'houseId'],
  ] as const)('%s sends the parent ID and the query to %s', async (method, path, parentParam) => {
    const { api, requestedUrl } = setup({ page: 1, size: 20, total: 57, data: [item('x1', 'Шевченка')] });

    const page = await api[method]('parent-1', 'Шев', signal);

    expect(page).toEqual({ items: [{ id: 'x1', name: { uk: 'Шевченка', ru: null, en: null } }], total: 57 });
    expect(requestedUrl().pathname).toBe(path);
    expect(Object.fromEntries(requestedUrl().searchParams)).toEqual({
      [parentParam]: 'parent-1',
      search: 'Шев',
      size: '20',
    });
  });

  it('keeps hasApartments for houses', async () => {
    const { api, requestedUrl } = setup({
      page: 1,
      size: 20,
      total: 1,
      data: [{ ...item('h1', '12А'), streetId: 's1', hasApartments: false }],
    });

    const page = await api.searchHouses('s1', '12', signal);

    expect(page.items[0]).toEqual({ id: 'h1', name: { uk: '12А', ru: null, en: null }, hasApartments: false });
    expect(requestedUrl().searchParams.get('streetId')).toBe('s1');
  });

  it.each([
    ['a non-array page', { page: 1, total: 0, data: null }],
    ['an item without id', { page: 1, total: 1, data: [{ name: { uk: 'X' } }] }],
    ['an item without a Ukrainian name', { page: 1, total: 1, data: [{ id: 'x', name: { en: 'X' } }] }],
  ])('rejects %s', async (_label, data) => {
    const { api } = setup(data);
    await expect(api.searchCities('a1', 'Київ', signal)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('rejects a house without hasApartments', async () => {
    const { api } = setup({ page: 1, total: 1, data: [item('h1', '1')] });
    await expect(api.searchHouses('s1', '1', signal)).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

describe('localizedName', () => {
  it('uses English only when available and falls back to Ukrainian', () => {
    expect(localizedName({ uk: 'Київ', ru: null, en: 'Kyiv' }, 'en')).toBe('Kyiv');
    expect(localizedName({ uk: 'Київ', ru: null, en: null }, 'en')).toBe('Київ');
    expect(localizedName({ uk: 'Київ', ru: 'Киев', en: 'Kyiv' }, 'uk')).toBe('Київ');
  });
});
