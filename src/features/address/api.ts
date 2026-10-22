import type { HttpClient } from '@/shared/api/http-client';
import { InvalidResponseError } from '@/shared/api/errors';
import type { operations } from '@/shared/api/schema';

/**
 * Address directory endpoints (backend OpenAPI spec, openapi/openapi.json). All require a Bearer token.
 *
 *   GET /v1/areas       search?                → all seeded areas (oblasts), ≤100 per page
 *   GET /v1/cities      areaId + search(≥3)    → cities of the area (local, then Portmone)
 *   GET /v1/streets     cityId + search(≥3)    → streets of the city (local, then Portmone)
 *   GET /v1/houses      streetId + search(≥1)  → houses of the street; `hasApartments` per house
 *   GET /v1/apartments  houseId + search(≥1)   → apartments of the house
 *
 * Every list is a page `{ page, size, total, data }`. Errors: 400 invalid params, 404 parent not found,
 * 503 Portmone unavailable and nothing found locally.
 */
export const ADDRESS_ENDPOINTS = {
  areas: '/v1/areas',
  cities: '/v1/cities',
  streets: '/v1/streets',
  houses: '/v1/houses',
  apartments: '/v1/apartments',
} as const;

/** `minLength` of the `search` parameter per endpoint (requests below it are rejected with 400). */
export const SEARCH_MIN_LENGTH = { city: 3, street: 3, house: 1, apartment: 1 } as const;

/** Results per search request; the spec allows up to 100, 20 is the backend default. */
export const SEARCH_PAGE_SIZE = 20;

/** The spec's maximum page size; the seeded areas fit into one page. */
const AREAS_PAGE_SIZE = 100;

type QueryOf<K extends keyof operations> = operations[K]['parameters']['query'];

export interface LocalizedName {
  readonly uk: string;
  readonly ru: string | null;
  readonly en: string | null;
}

/** A selectable directory record. `id` is the local UUID the next level and the backend expect. */
export interface AddressEntity {
  readonly id: string;
  readonly name: LocalizedName;
}

export interface HouseEntity extends AddressEntity {
  /** `false` for private houses: the address is complete without an apartment. */
  readonly hasApartments: boolean;
}

export interface SearchPage<T> {
  readonly items: readonly T[];
  /** Total matches on the server; can exceed `items.length` (only the first page is loaded). */
  readonly total: number;
}

function invalid(what: string): InvalidResponseError {
  return new InvalidResponseError(200, `Address response: ${what}`);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw invalid(`${what} is not an object`);
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function parseEntity(value: unknown): AddressEntity {
  const record = asRecord(value, 'item');
  const name = asRecord(record.name, 'item.name');
  if (typeof record.id !== 'string' || record.id === '') throw invalid('item.id is missing');
  if (typeof name.uk !== 'string') throw invalid('item.name.uk is missing');
  return { id: record.id, name: { uk: name.uk, ru: optionalString(name.ru), en: optionalString(name.en) } };
}

function parseHouse(value: unknown): HouseEntity {
  const record = asRecord(value, 'item');
  if (typeof record.hasApartments !== 'boolean') throw invalid('item.hasApartments is missing');
  return { ...parseEntity(value), hasApartments: record.hasApartments };
}

function pageParser<T>(parseItem: (value: unknown) => T): (data: unknown) => SearchPage<T> {
  return (data) => {
    const page = asRecord(data, 'page');
    if (!Array.isArray(page.data)) throw invalid('page.data is not an array');
    const items = page.data.map(parseItem);
    return { items, total: typeof page.total === 'number' ? page.total : items.length };
  };
}

const parseEntityPage = pageParser(parseEntity);
const parseHousePage = pageParser(parseHouse);

export type AddressSearch<T> = (parentId: string, search: string, signal: AbortSignal) => Promise<SearchPage<T>>;

export interface AddressApi {
  listAreas(signal: AbortSignal): Promise<SearchPage<AddressEntity>>;
  searchCities: AddressSearch<AddressEntity>;
  searchStreets: AddressSearch<AddressEntity>;
  searchHouses: AddressSearch<HouseEntity>;
  searchApartments: AddressSearch<AddressEntity>;
}

/** Uses the authenticated client: the directory endpoints require a Bearer token. */
export function createAddressApi(client: HttpClient): AddressApi {
  return {
    listAreas: (signal) => {
      const query: QueryOf<'AreaController_search_v1'> = { size: AREAS_PAGE_SIZE };
      return client.get(ADDRESS_ENDPOINTS.areas, { query, signal, parse: parseEntityPage });
    },
    searchCities: (areaId, search, signal) => {
      const query: QueryOf<'CitiesController_search_v1'> = { areaId, search, size: SEARCH_PAGE_SIZE };
      return client.get(ADDRESS_ENDPOINTS.cities, { query, signal, parse: parseEntityPage });
    },
    searchStreets: (cityId, search, signal) => {
      const query: QueryOf<'StreetsController_search_v1'> = { cityId, search, size: SEARCH_PAGE_SIZE };
      return client.get(ADDRESS_ENDPOINTS.streets, { query, signal, parse: parseEntityPage });
    },
    searchHouses: (streetId, search, signal) => {
      const query: QueryOf<'HousesController_search_v1'> = { streetId, search, size: SEARCH_PAGE_SIZE };
      return client.get(ADDRESS_ENDPOINTS.houses, { query, signal, parse: parseHousePage });
    },
    searchApartments: (houseId, search, signal) => {
      const query: QueryOf<'ApartmentsController_search_v1'> = { houseId, search, size: SEARCH_PAGE_SIZE };
      return client.get(ADDRESS_ENDPOINTS.apartments, { query, signal, parse: parseEntityPage });
    },
  };
}

/** Display name in the app locale; Ukrainian is always present and is the fallback. */
export function localizedName(name: LocalizedName, locale: string): string {
  if (locale === 'en' && name.en !== null) return name.en;
  return name.uk;
}
