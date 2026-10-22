import { describe, expect, it, vi } from 'vitest';
import { InvalidResponseError } from '@/shared/api/errors';
import { createHttpClient } from '@/shared/api/http-client';
import { okResponse, savedAddressPayload, urlOf } from '@/test/http';
import type { AddressEntity, HouseEntity } from './api';
import { emptySelection } from './selection';
import { createUserAddressesApi, parseSavedAddress, toCreateUserAddress } from './user-addresses';

const entity = (id: string): AddressEntity => ({ id, name: { uk: id, ru: null, en: null } });
const house = (hasApartments: boolean): HouseEntity => ({ ...entity('house-1'), hasApartments });
const path = { area: entity('area-1'), city: entity('city-1'), street: entity('street-1') };

describe('toCreateUserAddress', () => {
  it('is null until the address is complete', () => {
    expect(toCreateUserAddress(emptySelection)).toBeNull();
    expect(toCreateUserAddress({ ...emptySelection, ...path })).toBeNull();
    expect(toCreateUserAddress({ ...emptySelection, ...path, house: house(true) })).toBeNull();
  });

  it('saves the apartment of a multi-apartment house', () => {
    expect(toCreateUserAddress({ ...path, house: house(true), apartment: entity('apt-1') })).toEqual({
      type: 'apartment',
      addressId: 'apt-1',
    });
  });

  it('saves the house itself when it has no apartments', () => {
    expect(toCreateUserAddress({ ...emptySelection, ...path, house: house(false) })).toEqual({
      type: 'house',
      addressId: 'house-1',
    });
  });
});

describe('parseSavedAddress', () => {
  it('reads the full address path; apartment is null for houses', () => {
    expect(parseSavedAddress(savedAddressPayload('saved-1', false))).toEqual({
      id: 'saved-1',
      type: 'house',
      addressId: 'house-1',
      label: null,
      area: { id: 'area-1', name: { uk: 'м. Київ', ru: null, en: 'Kyiv' } },
      city: { id: 'city-1', name: { uk: 'Київ', ru: null, en: null } },
      street: { id: 'street-1', name: { uk: 'вул. Хрещатик', ru: null, en: null } },
      house: { id: 'house-1', name: { uk: '22', ru: null, en: null } },
      apartment: null,
    });
  });

  it('falls back to another language when `uk` is absent (no language is required in this DTO)', () => {
    const payload = { ...savedAddressPayload('saved-1', false), city: { id: 'city-1', name: { en: 'Kyiv' } } };
    expect(parseSavedAddress(payload).city.name).toEqual({ uk: 'Kyiv', ru: null, en: 'Kyiv' });
  });

  it.each([
    ['an unknown type', { type: 'office' }],
    ['an apartment address without apartment', { type: 'apartment', apartment: null }],
    ['a missing house', { house: null }],
    ['a nameless street', { street: { id: 'street-1', name: {} } }],
  ])('rejects %s', (_label, patch) => {
    expect(() => parseSavedAddress({ ...savedAddressPayload('saved-1', false), ...patch })).toThrow(
      InvalidResponseError,
    );
  });
});

describe('createUserAddressesApi', () => {
  it('POSTs exactly { type, addressId } and returns the saved address', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(okResponse(savedAddressPayload('saved-1', true)));
    const api = createUserAddressesApi(createHttpClient({ baseUrl: 'https://api.test', timeoutMs: 1000, fetch }));

    const saved = await api.save({ type: 'apartment', addressId: 'apt-1' });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(urlOf(url)).toBe('https://api.test/v1/user-addresses');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"type":"apartment","addressId":"apt-1"}');
    expect(saved.id).toBe('saved-1');
    expect(saved.apartment?.id).toBe('apt-1');
  });

  it('loads every page of saved addresses', async () => {
    const page = (n: number, ids: string[], total: number) =>
      okResponse({ page: n, size: 100, total, data: ids.map((id) => savedAddressPayload(id, false)) });
    const ids = Array.from({ length: 100 }, (_, index) => `a${String(index)}`);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(page(1, ids, 101))
      .mockResolvedValueOnce(page(2, ['a100'], 101));
    const api = createUserAddressesApi(createHttpClient({ baseUrl: 'https://api.test', timeoutMs: 1000, fetch }));

    const list = await api.list(new AbortController().signal);

    expect(list).toHaveLength(101);
    expect(fetch.mock.calls.map(([url]) => new URL(urlOf(url)).search)).toEqual([
      '?page=1&size=100',
      '?page=2&size=100',
    ]);
  });
});
