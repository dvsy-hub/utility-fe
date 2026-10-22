import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from './env';

describe('parseConfig', () => {
  it('normalizes the API base URL', () => {
    const config = parseConfig({ API_BASE_URL: 'https://api.example.com/' }, { isDev: false });
    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(config.telegramBotUrl).toBeNull();
  });

  it('requires the API base URL', () => {
    expect(() => parseConfig({}, { isDev: false })).toThrow(ConfigError);
    expect(() => parseConfig({ API_BASE_URL: '  ' }, { isDev: true })).toThrow(ConfigError);
  });

  it('requires https in production but allows http in development', () => {
    expect(() => parseConfig({ API_BASE_URL: 'http://localhost:3000' }, { isDev: false })).toThrow(ConfigError);
    expect(parseConfig({ API_BASE_URL: 'http://localhost:3000' }, { isDev: true }).apiBaseUrl).toBe(
      'http://localhost:3000',
    );
  });

  it('rejects malformed URLs', () => {
    expect(() => parseConfig({ API_BASE_URL: 'not a url' }, { isDev: true })).toThrow(ConfigError);
    expect(() => parseConfig({ API_BASE_URL: 'https://x.test/?a=1' }, { isDev: true })).toThrow(ConfigError);
  });

  it('never exposes the dev initData override outside development', () => {
    const env = { API_BASE_URL: 'https://api.example.com', DEV_INIT_DATA: 'query_id=1' };
    expect(parseConfig(env, { isDev: false }).devInitData).toBeNull();
    expect(parseConfig(env, { isDev: true }).devInitData).toBe('query_id=1');
  });

  it('validates the optional bot URL', () => {
    const config = parseConfig(
      { API_BASE_URL: 'https://api.example.com', TELEGRAM_BOT_URL: 'https://t.me/utilityhub_bot' },
      { isDev: false },
    );
    expect(config.telegramBotUrl).toBe('https://t.me/utilityhub_bot');
  });
});
