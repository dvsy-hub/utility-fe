import type { HttpClient } from '@/shared/api/http-client';
import { InvalidResponseError } from '@/shared/api/errors';
import type { components, operations } from '@/shared/api/schema';
import type { AddressEntity, LocalizedName } from './api';
import type { AddressSelection } from './selection';

/**
 * Saved addresses of the current user (openapi/openapi.json, "User Addresses"). Both require a Bearer token.
 *
 *   GET  /v1/user-addresses  ?page&size(≤100)        → page of saved addresses with the full local path
 *   POST /v1/user-addresses  { type, addressId, label? } → the saved address, or the EXISTING one if it was
 *                                                        already saved (the backend de-duplicates)
 *
 * `type` is `house` or `apartment`; `addressId` is the local UUID of that house or apartment. Nothing else
 * from the path is sent: the backend derives area/city/street from the house.
 */
export const USER_ADDRESSES_ENDPOINT = '/v1/user-addresses';

/** The spec's maximum page size. */
const LIST_PAGE_SIZE = 100;
/** Safety stop for a misbehaving `total` (100 pages × 100 = 10 000 addresses). */
const MAX_LIST_PAGES = 100;

export type CreateUserAddress = components['schemas']['CreateUserAddressDto'];
type ListQuery = NonNullable<operations['UserAddressesController_list_v1']['parameters']['query']>;

export interface SavedAddress {
  readonly id: string;
  readonly type: 'house' | 'apartment';
  readonly addressId: string;
  readonly label: string | null;
  readonly area: AddressEntity;
  readonly city: AddressEntity;
  readonly street: AddressEntity;
  readonly house: AddressEntity;
  /** `null` for a house without apartments. */
  readonly apartment: AddressEntity | null;
}

export interface UserAddressesApi {
  /** All saved addresses (follows pagination). Order as returned by the backend. */
  readonly list: (signal: AbortSignal) => Promise<readonly SavedAddress[]>;
  readonly save: (body: CreateUserAddress) => Promise<SavedAddress>;
}

/**
 * Request body for a complete selection, or `null` while it is incomplete.
 * `house.hasApartments` (from `GET /v1/houses`) decides whether the apartment is the saved entity.
 */
export function toCreateUserAddress(selection: AddressSelection): CreateUserAddress | null {
  const { area, city, street, house, apartment } = selection;
  if (area === null || city === null || street === null || house === null) return null;
  if (house.hasApartments) return apartment === null ? null : { type: 'apartment', addressId: apartment.id };
  return { type: 'house', addressId: house.id };
}

function invalid(what: string): InvalidResponseError {
  return new InvalidResponseError(200, `User address response: ${what}`);
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw invalid(`${what} is not an object`);
  return value as Record<string, unknown>;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/**
 * In this response the spec marks no name language as required (the directory endpoints require `uk`),
 * so fall back to any available language instead of rejecting the whole list.
 */
function parseName(value: unknown, what: string): LocalizedName {
  const name = record(value, `${what}.name`);
  const uk = text(name.uk);
  const ru = text(name.ru);
  const en = text(name.en);
  const fallback = uk ?? en ?? ru;
  if (fallback === null) throw invalid(`${what}.name has no text`);
  return { uk: fallback, ru, en };
}

function parseRef(value: unknown, what: string): AddressEntity {
  const ref = record(value, what);
  if (typeof ref.id !== 'string' || ref.id === '') throw invalid(`${what}.id is missing`);
  return { id: ref.id, name: parseName(ref.name, what) };
}

export function parseSavedAddress(value: unknown): SavedAddress {
  const item = record(value, 'address');
  if (typeof item.id !== 'string' || item.id === '') throw invalid('id is missing');
  if (item.type !== 'house' && item.type !== 'apartment') throw invalid('type is invalid');
  if (typeof item.addressId !== 'string') throw invalid('addressId is missing');
  const apartment =
    item.apartment === null || item.apartment === undefined ? null : parseRef(item.apartment, 'apartment');
  if (item.type === 'apartment' && apartment === null) throw invalid('apartment is missing');
  return {
    id: item.id,
    type: item.type,
    addressId: item.addressId,
    label: text(item.label),
    area: parseRef(item.area, 'area'),
    city: parseRef(item.city, 'city'),
    street: parseRef(item.street, 'street'),
    house: parseRef(item.house, 'house'),
    apartment,
  };
}

interface ListPage {
  readonly items: readonly SavedAddress[];
  readonly total: number;
}

function parseListPage(data: unknown): ListPage {
  const page = record(data, 'page');
  if (!Array.isArray(page.data)) throw invalid('page.data is not an array');
  const items = page.data.map(parseSavedAddress);
  return { items, total: typeof page.total === 'number' ? page.total : items.length };
}

export function createUserAddressesApi(client: HttpClient): UserAddressesApi {
  return {
    list: async (signal) => {
      const all: SavedAddress[] = [];
      for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
        const query: ListQuery = { page, size: LIST_PAGE_SIZE };
        const result = await client.get(USER_ADDRESSES_ENDPOINT, { query, signal, parse: parseListPage });
        all.push(...result.items);
        if (result.items.length === 0 || all.length >= result.total) break;
      }
      return all;
    },
    save: (body) => client.post(USER_ADDRESSES_ENDPOINT, body, { parse: parseSavedAddress }),
  };
}
