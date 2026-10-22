import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from '@/shared/api/http-client';
import { InvalidResponseError } from '@/shared/api/errors';
import { errorResponse, okResponse, tokenPayload, userPayload } from '@/test/http';
import { createAuthApi, fetchCurrentUser, parseCurrentUser, parseTokenPair } from './api';

const BASE = 'https://api.test';

describe('auth api', () => {
  it('posts raw initData to /v1/auth/telegram exactly as the spec requires', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(okResponse(tokenPayload('x')));
    const api = createAuthApi(createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch }));
    const initData = 'query_id=AAA&user=%7B%22id%22%3A1%7D&auth_date=1&signature=s&hash=h';

    await expect(api.loginWithTelegram(initData)).resolves.toEqual(tokenPayload('x'));

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/v1/auth/telegram');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ initData }));
  });

  it('sends the refresh token in the body for refresh and logout', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(okResponse(tokenPayload('y')))
      .mockResolvedValueOnce(okResponse({ revoked: true }));
    const api = createAuthApi(createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch }));

    await api.refresh('rt-1');
    await api.logout('rt-2');

    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.test/v1/auth/refresh');
    expect(fetch.mock.calls[0]?.[1]?.body).toBe('{"refreshToken":"rt-1"}');
    expect(fetch.mock.calls[1]?.[0]).toBe('https://api.test/v1/auth/logout');
    expect(fetch.mock.calls[1]?.[1]?.body).toBe('{"refreshToken":"rt-2"}');
  });

  it('propagates 401 for invalid initData', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(errorResponse(401, 'Invalid Telegram init data'));
    const api = createAuthApi(createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch }));

    await expect(api.loginWithTelegram('garbage')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid Telegram init data',
    });
  });

  it('loads the profile from /v1/auth/me', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(okResponse(userPayload));
    const client = createHttpClient({ baseUrl: BASE, timeoutMs: 1000, fetch });

    await expect(fetchCurrentUser(client)).resolves.toEqual({
      id: userPayload.id,
      firstName: 'Олена',
      lastName: null,
      createdAt: userPayload.createdAt,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.test/v1/auth/me');
  });
});

describe('response parsers', () => {
  it('requires both tokens', () => {
    expect(() => parseTokenPair({ accessToken: 'a' })).toThrow(InvalidResponseError);
    expect(() => parseTokenPair({ refreshToken: 'r' })).toThrow(InvalidResponseError);
    expect(() => parseTokenPair(null)).toThrow(InvalidResponseError);
    expect(parseTokenPair({ accessToken: 'a', refreshToken: 'r' })).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    });
  });

  it('requires a user id', () => {
    expect(() => parseCurrentUser({ firstName: 'x' })).toThrow(InvalidResponseError);
  });
});
