/**
 * Test helpers that build responses in the backend's real envelope format
 * (shapes copied from responses observed on the live API).
 */
export function okResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ result: true, error: { message: '', code: 0 }, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  status: number,
  message: string,
  details: readonly string[] | string | null = null,
): Response {
  return new Response(JSON.stringify({ result: false, error: { message, code: status, details }, data: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const tokenPayload = (suffix: string) => ({
  accessToken: `access-${suffix}`,
  refreshToken: `refresh-${suffix}`,
  accessTokenExpiresAt: '2026-10-19T12:00:00.000Z',
  refreshTokenExpiresAt: '2026-11-19T12:00:00.000Z',
});

export const userPayload = {
  id: '01a14bb2-47f5-7b51-81f4-b6af3fc2fc88',
  firstName: 'Олена',
  lastName: null,
  createdAt: '2026-10-17T21:08:57.457Z',
  updatedAt: '2026-10-18T18:54:32.407Z',
};

export function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

/** URL of a `fetch` call, whatever form the input took. */
export function urlOf(input: string | URL | Request | undefined): string {
  if (input === undefined) return '';
  return input instanceof Request ? input.url : input.toString();
}

/** A saved address exactly as documented for `GET`/`POST /v1/user-addresses` (UserAddress data). */
export const savedAddressPayload = (id: string, apartment: boolean) => ({
  id,
  type: apartment ? 'apartment' : 'house',
  addressId: apartment ? 'apt-1' : 'house-1',
  label: null,
  area: { id: 'area-1', name: { uk: 'м. Київ', en: 'Kyiv' } },
  city: { id: 'city-1', name: { uk: 'Київ' } },
  street: { id: 'street-1', name: { uk: 'вул. Хрещатик' } },
  house: { id: 'house-1', name: { uk: '22' } },
  apartment: apartment ? { id: 'apt-1', name: { uk: '17' } } : null,
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
});
