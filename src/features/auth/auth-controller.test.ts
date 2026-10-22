import { describe, expect, it, vi } from 'vitest';
import { ApiError, InvalidResponseError, NetworkError, TimeoutError } from '@/shared/api/errors';
import type { LaunchContext } from '@/telegram/webapp';
import { tokenPayload, userPayload } from '@/test/http';
import type { AuthApi, CurrentUser } from './api';
import { AuthController, classifyAuthError } from './auth-controller';
import { createMemorySessionStore, type SessionStore } from './session-store';
import { TokenManager } from './token-manager';

const launch: LaunchContext = {
  source: 'telegram',
  initData: 'query_id=AAA&user=%7B%22id%22%3A42%7D&auth_date=1760000000&hash=abc',
  hintUserId: 42,
  hintLanguageCode: 'uk',
  platform: 'ios',
  version: '9.0',
};

const user: CurrentUser = { id: userPayload.id, firstName: 'Олена', lastName: null, createdAt: userPayload.createdAt };

const apiError = (status: number, message = 'error') => new ApiError({ status, code: status, message, details: null });

function setup(options: {
  launch?: LaunchContext | null;
  login?: AuthApi['loginWithTelegram'];
  me?: () => Promise<CurrentUser>;
  store?: SessionStore;
}) {
  const api = {
    loginWithTelegram: vi.fn<AuthApi['loginWithTelegram']>(options.login ?? (() => Promise.resolve(tokenPayload('a')))),
    refresh: vi.fn<AuthApi['refresh']>(() => Promise.resolve(tokenPayload('b'))),
    logout: vi.fn<AuthApi['logout']>(() => Promise.resolve()),
  };
  const tokens = new TokenManager({ api, store: options.store ?? createMemorySessionStore(), owner: 'tg:42' });
  const fetchCurrentUser = vi.fn(options.me ?? (() => Promise.resolve(user)));
  const controller = new AuthController({
    launch: options.launch === undefined ? launch : options.launch,
    tokens,
    fetchCurrentUser,
  });
  return { api, tokens, fetchCurrentUser, controller };
}

describe('AuthController', () => {
  it('reports `unsupported` outside Telegram without calling the API', async () => {
    const { controller, api } = setup({ launch: null });

    await controller.start();

    expect(controller.getState()).toEqual({ status: 'unsupported' });
    expect(api.loginWithTelegram).not.toHaveBeenCalled();
  });

  it('exchanges raw initData, then confirms the session via /me', async () => {
    const { controller, api, fetchCurrentUser } = setup({});
    const seen: string[] = [];
    controller.subscribe(() => seen.push(controller.getState().status));

    await controller.start();

    expect(api.loginWithTelegram).toHaveBeenCalledExactlyOnceWith(launch.initData);
    expect(fetchCurrentUser).toHaveBeenCalledOnce();
    expect(controller.getState()).toEqual({ status: 'authenticated', user });
    expect(seen).toEqual(['authenticating', 'authenticated']);
  });

  it('is idempotent: concurrent and repeated starts perform a single login', async () => {
    const { controller, api } = setup({});

    await Promise.all([controller.start(), controller.start()]);
    await controller.start();

    expect(api.loginWithTelegram).toHaveBeenCalledOnce();
  });

  it('reuses a session persisted earlier in this WebView (reload) without a new login', async () => {
    const store = createMemorySessionStore();
    store.save('tg:42', tokenPayload('stored'));
    const { controller, api } = setup({ store });

    await controller.start();

    expect(api.loginWithTelegram).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('authenticated');
  });

  it('falls back to initData when the persisted session is rejected', async () => {
    const store = createMemorySessionStore();
    store.save('tg:42', tokenPayload('stale'));
    const me = vi
      .fn<() => Promise<CurrentUser>>()
      .mockRejectedValueOnce(apiError(401, 'Invalid or expired token'))
      .mockResolvedValueOnce(user);
    const { controller, api } = setup({ store, me });

    await controller.start();

    expect(api.loginWithTelegram).toHaveBeenCalledOnce();
    expect(controller.getState().status).toBe('authenticated');
  });

  it('never authenticates when /me fails after login', async () => {
    const { controller } = setup({ me: () => Promise.reject(apiError(401)) });

    await controller.start();

    expect(controller.getState()).toMatchObject({ status: 'error', failure: { kind: 'unexpected' } });
  });

  it('maps a rejected initData to a non-retryable failure', async () => {
    const { controller } = setup({ login: () => Promise.reject(apiError(401, 'Invalid Telegram init data')) });

    await controller.start();

    expect(controller.getState()).toMatchObject({
      status: 'error',
      failure: { kind: 'invalid_init_data', retryable: false },
    });
  });

  it('recovers through retry after a transient failure', async () => {
    const login = vi
      .fn<AuthApi['loginWithTelegram']>()
      .mockRejectedValueOnce(new NetworkError('offline'))
      .mockResolvedValueOnce(tokenPayload('a'));
    const { controller } = setup({ login });

    await controller.start();
    expect(controller.getState()).toMatchObject({ status: 'error', failure: { kind: 'network', retryable: true } });

    await controller.retry();
    expect(controller.getState().status).toBe('authenticated');
  });

  it('signs out and can sign in again', async () => {
    const { controller, api, tokens } = setup({});
    await controller.start();

    await controller.signOut();
    expect(controller.getState()).toEqual({ status: 'signed_out' });
    expect(api.logout).toHaveBeenCalledWith('refresh-a');
    expect(tokens.hasSession()).toBe(false);

    await controller.retry();
    expect(controller.getState().status).toBe('authenticated');
    expect(api.loginWithTelegram).toHaveBeenCalledTimes(2);
  });

  it('stays signed out when sign-out happens during authentication', async () => {
    let resolveLogin: (value: ReturnType<typeof tokenPayload>) => void = () => undefined;
    const login = vi.fn<AuthApi['loginWithTelegram']>(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );
    const { controller, tokens, fetchCurrentUser } = setup({ login });

    const starting = controller.start();
    await controller.signOut();
    resolveLogin(tokenPayload('late'));
    await starting;

    expect(controller.getState()).toEqual({ status: 'signed_out' });
    expect(tokens.hasSession()).toBe(false);
    expect(fetchCurrentUser).not.toHaveBeenCalled();
  });

  it('re-authenticates silently when the session expires mid-use', async () => {
    const { controller, api, tokens } = setup({});
    await controller.start();
    api.refresh.mockRejectedValueOnce(apiError(401));

    await tokens.refreshAccessToken(tokens.getAccessToken());
    await vi.waitFor(() => {
      expect(controller.getState().status).toBe('authenticated');
    });

    expect(api.loginWithTelegram).toHaveBeenCalledTimes(2);
  });
});

describe('classifyAuthError', () => {
  it.each([
    [apiError(401), 'login', 'invalid_init_data', false],
    [apiError(400), 'login', 'invalid_init_data', false],
    [apiError(403), 'login', 'account_inactive', false],
    [apiError(503), 'login', 'auth_unavailable', true],
    [apiError(500), 'profile', 'server', true],
    [apiError(401), 'profile', 'unexpected', true],
    [new NetworkError('x'), 'login', 'network', true],
    [new TimeoutError('x'), 'login', 'timeout', true],
    [new InvalidResponseError(200, 'x'), 'login', 'unexpected', true],
    [new Error('boom'), 'login', 'unexpected', true],
  ] as const)('%o during %s → %s', (error, stage, kind, retryable) => {
    expect(classifyAuthError(error, stage)).toMatchObject({ kind, retryable });
  });
});
