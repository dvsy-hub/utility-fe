import { describe, expect, it, vi } from 'vitest';
import { errorResponse, headerOf, okResponse } from '@/test/http';
import { ApiError, InvalidResponseError, NetworkError, TimeoutError } from './errors';
import { createHttpClient, type AccessTokenProvider } from './http-client';

const BASE = 'https://api.test';

function mockFetch(...responses: (Response | Error)[]) {
  const fn = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fn.mockRejectedValueOnce(response);
    else fn.mockResolvedValueOnce(response);
  }
  return fn;
}

function tokenProvider(initial: string | null, renewed: string | null): AccessTokenProvider & { token: string | null } {
  const provider = {
    token: initial,
    getAccessToken: () => provider.token,
    refreshAccessToken: vi.fn(() => {
      provider.token = renewed;
      return Promise.resolve(renewed);
    }),
  };
  return provider;
}

describe('createHttpClient', () => {
  it('unwraps `data` from a successful envelope and sends JSON', async () => {
    const fetch = mockFetch(okResponse({ hello: 'world' }));
    const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch });

    await expect(client.post('/v1/echo', { a: 1 })).resolves.toEqual({ hello: 'world' });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/v1/echo');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"a":1}');
    expect(init?.credentials).toBe('omit');
    expect(headerOf(init, 'Content-Type')).toBe('application/json');
    expect(headerOf(init, 'Authorization')).toBeNull();
  });

  it('serializes query parameters and skips empty ones', async () => {
    const fetch = mockFetch(okResponse([]));
    const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch });

    await client.get('/v1/areas', { query: { size: 10, search: 'Київ', page: undefined } });

    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.test/v1/areas?size=10&search=%D0%9A%D0%B8%D1%97%D0%B2');
  });

  it('maps the error envelope to ApiError with status, code and details', async () => {
    const fetch = mockFetch(errorResponse(400, 'Bad Request Exception', ['initData should not be empty']));
    const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch });

    const error = await client.post('/v1/auth/telegram', { initData: '' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 400,
      message: 'Bad Request Exception',
      details: ['initData should not be empty'],
    });
  });

  it('rejects non-envelope responses with InvalidResponseError', async () => {
    const fetch = mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch });

    await expect(client.get('/v1/auth/me')).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('wraps transport failures in NetworkError', async () => {
    const fetch = mockFetch(new TypeError('Failed to fetch'));
    const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch });

    await expect(client.get('/v1/auth/me')).rejects.toBeInstanceOf(NetworkError);
  });

  it('aborts slow requests with TimeoutError', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const client = createHttpClient({ baseUrl: BASE, timeoutMs: 10, fetch });

    await expect(client.get('/v1/auth/me')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('runs the optional parser on `data`', async () => {
    const fetch = mockFetch(okResponse({ n: '5' }));
    const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch });

    const value = await client.get('/x', { parse: (data) => Number((data as { n: string }).n) });

    expect(value).toBe(5);
  });

  describe('with an access token provider', () => {
    it('sends the Bearer token', async () => {
      const fetch = mockFetch(okResponse({}));
      const auth = tokenProvider('t1', 't2');
      const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch, auth });

      await client.get('/v1/auth/me');

      expect(headerOf(fetch.mock.calls[0]?.[1], 'Authorization')).toBe('Bearer t1');
      expect(auth.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('refreshes once on 401 and retries with the new token', async () => {
      const fetch = mockFetch(errorResponse(401, 'Invalid or expired token'), okResponse({ id: 'u1' }));
      const auth = tokenProvider('t1', 't2');
      const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch, auth });

      await expect(client.get('/v1/auth/me')).resolves.toEqual({ id: 'u1' });

      expect(auth.refreshAccessToken).toHaveBeenCalledExactlyOnceWith('t1');
      expect(headerOf(fetch.mock.calls[1]?.[1], 'Authorization')).toBe('Bearer t2');
    });

    it('retries a POST with the same body after refresh', async () => {
      const fetch = mockFetch(errorResponse(401, 'Invalid or expired token'), okResponse({ ok: true }));
      const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch, auth: tokenProvider('t1', 't2') });

      await client.post('/v1/user-addresses', { type: 'house', addressId: 'x' });

      expect(fetch.mock.calls[1]?.[1]?.body).toBe('{"type":"house","addressId":"x"}');
    });

    it('surfaces the 401 when the session cannot be renewed (no retry loop)', async () => {
      const fetch = mockFetch(errorResponse(401, 'Invalid or expired token'));
      const auth = tokenProvider('t1', null);
      const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch, auth });

      await expect(client.get('/v1/auth/me')).rejects.toMatchObject({ status: 401 });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry more than once', async () => {
      const fetch = mockFetch(errorResponse(401, 'expired'), errorResponse(401, 'still expired'));
      const auth = tokenProvider('t1', 't2');
      const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch, auth });

      await expect(client.get('/v1/auth/me')).rejects.toMatchObject({ status: 401, message: 'still expired' });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    });
  });
});
