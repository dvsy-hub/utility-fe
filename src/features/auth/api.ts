import type { components } from '@/shared/api/schema';
import type { HttpClient } from '@/shared/api/http-client';
import { InvalidResponseError } from '@/shared/api/errors';

/**
 * Auth endpoints, exactly as published in the backend OpenAPI spec (openapi/openapi.json):
 *
 *   POST /v1/auth/telegram  { initData }      → TokenPair
 *   POST /v1/auth/refresh   { refreshToken }  → TokenPair (rotated)
 *   POST /v1/auth/logout    { refreshToken }  → { revoked }
 *   GET  /v1/auth/me        Bearer            → CurrentUser
 */
export const AUTH_ENDPOINTS = {
  telegram: '/v1/auth/telegram',
  refresh: '/v1/auth/refresh',
  logout: '/v1/auth/logout',
  me: '/v1/auth/me',
} as const;

type TelegramLoginBody = components['schemas']['TelegramLoginDto'];
type RefreshTokenBody = components['schemas']['RefreshTokenDto'];

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** ISO timestamp from the server; informational (client clocks may be skewed). */
  readonly accessTokenExpiresAt: string | null;
  readonly refreshTokenExpiresAt: string | null;
}

export interface CurrentUser {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly createdAt: string | null;
}

function asRecord(data: unknown, what: string): Record<string, unknown> {
  if (typeof data !== 'object' || data === null) {
    throw new InvalidResponseError(200, `${what}: expected an object`);
  }
  return data as Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * The spec does not mark token fields as required, so they are validated at runtime:
 * a session is never considered established without both tokens.
 */
export function parseTokenPair(data: unknown): TokenPair {
  const record = asRecord(data, 'Token response');
  const { accessToken, refreshToken } = record;
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new InvalidResponseError(200, 'Token response: accessToken is missing');
  }
  if (typeof refreshToken !== 'string' || refreshToken === '') {
    throw new InvalidResponseError(200, 'Token response: refreshToken is missing');
  }
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: optionalString(record.accessTokenExpiresAt),
    refreshTokenExpiresAt: optionalString(record.refreshTokenExpiresAt),
  };
}

export function parseCurrentUser(data: unknown): CurrentUser {
  const record = asRecord(data, 'Profile response');
  if (typeof record.id !== 'string' || record.id === '') {
    throw new InvalidResponseError(200, 'Profile response: id is missing');
  }
  return {
    id: record.id,
    firstName: optionalString(record.firstName),
    lastName: optionalString(record.lastName),
    createdAt: optionalString(record.createdAt),
  };
}

export interface AuthApi {
  loginWithTelegram(initData: string): Promise<TokenPair>;
  refresh(refreshToken: string): Promise<TokenPair>;
  logout(refreshToken: string): Promise<void>;
}

/** Uses a client WITHOUT token handling: these endpoints take credentials in the body. */
export function createAuthApi(publicClient: HttpClient): AuthApi {
  return {
    loginWithTelegram: (initData) => {
      const body: TelegramLoginBody = { initData };
      return publicClient.post(AUTH_ENDPOINTS.telegram, body, { parse: parseTokenPair });
    },
    refresh: (refreshToken) => {
      const body: RefreshTokenBody = { refreshToken };
      return publicClient.post(AUTH_ENDPOINTS.refresh, body, { parse: parseTokenPair });
    },
    logout: async (refreshToken) => {
      const body: RefreshTokenBody = { refreshToken };
      await publicClient.post(AUTH_ENDPOINTS.logout, body);
    },
  };
}

/** Requires the authenticated client (Bearer token + refresh-on-401). */
export function fetchCurrentUser(client: HttpClient, signal?: AbortSignal): Promise<CurrentUser> {
  return client.get(AUTH_ENDPOINTS.me, { parse: parseCurrentUser, ...(signal ? { signal } : {}) });
}
