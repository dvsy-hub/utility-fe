import { describe, expect, it } from 'vitest';
import { readRuntimeConfig } from './runtime-config';

describe('readRuntimeConfig', () => {
  it('reads the server environment', () => {
    const result = readRuntimeConfig({ NODE_ENV: 'production', API_BASE_URL: 'https://api.example.com' });
    expect(result).toEqual({
      ok: true,
      config: {
        apiBaseUrl: 'https://api.example.com',
        telegramBotUrl: null,
        devInitData: null,
        requestTimeoutMs: 15_000,
      },
    });
  });

  it('honours DEV_INIT_DATA only in development', () => {
    const env = { API_BASE_URL: 'https://api.example.com', DEV_INIT_DATA: 'query_id=1' };
    expect(readRuntimeConfig({ ...env, NODE_ENV: 'development' })).toMatchObject({
      config: { devInitData: 'query_id=1' },
    });
    expect(readRuntimeConfig({ ...env, NODE_ENV: 'production' })).toMatchObject({ config: { devInitData: null } });
  });

  it('reports invalid configuration instead of throwing', () => {
    expect(readRuntimeConfig({ NODE_ENV: 'production' })).toEqual({
      ok: false,
      error: 'API_BASE_URL is not set. Copy .env.example to .env.local and fill it in.',
    });
  });
});
