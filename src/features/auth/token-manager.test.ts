import { describe, expect, it, vi, type Mock } from 'vitest';
import { ApiError, NetworkError } from '@/shared/api/errors';
import { tokenPayload } from '@/test/http';
import type { AuthApi, TokenPair } from './api';
import { createMemorySessionStore, createSessionStore } from './session-store';
import { TokenManager, sessionOwnerKey } from './token-manager';

const unauthorized = () => new ApiError({ status: 401, code: 401, message: 'Invalid or expired token', details: null });

type AuthApiMocks = { [K in keyof AuthApi]: Mock<AuthApi[K]> };

function fakeApi(overrides: Partial<AuthApiMocks> = {}): AuthApiMocks {
  return {
    loginWithTelegram: vi.fn<AuthApi['loginWithTelegram']>(() => Promise.resolve(tokenPayload('login'))),
    refresh: vi.fn<AuthApi['refresh']>(() => Promise.resolve(tokenPayload('refreshed'))),
    logout: vi.fn<AuthApi['logout']>(() => Promise.resolve()),
    ...overrides,
  };
}

describe('TokenManager', () => {
  it('stores tokens after initData sign-in', async () => {
    const api = fakeApi();
    const store = createMemorySessionStore();
    const manager = new TokenManager({ api, store, owner: 'tg:1' });

    await manager.signInWithInitData('query_id=1&hash=abc');

    expect(api.loginWithTelegram).toHaveBeenCalledWith('query_id=1&hash=abc');
    expect(manager.getAccessToken()).toBe('access-login');
    expect(store.load('tg:1')?.refreshToken).toBe('refresh-login');
  });

  it('shares one refresh between concurrent callers (refresh tokens rotate)', async () => {
    let resolveRefresh: (value: TokenPair) => void = () => undefined;
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>(
        () =>
          new Promise<TokenPair>((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    });
    const manager = new TokenManager({ api, store: createMemorySessionStore(), owner: 'tg:1' });
    await manager.signInWithInitData('x');

    const first = manager.refreshAccessToken('access-login');
    const second = manager.refreshAccessToken('access-login');
    resolveRefresh(tokenPayload('rotated'));

    await expect(Promise.all([first, second])).resolves.toEqual(['access-rotated', 'access-rotated']);
    expect(api.refresh).toHaveBeenCalledExactlyOnceWith('refresh-login');
  });

  it('skips refreshing when the rejected token was already replaced', async () => {
    const api = fakeApi();
    const manager = new TokenManager({ api, store: createMemorySessionStore(), owner: 'tg:1' });
    await manager.signInWithInitData('x');

    await expect(manager.refreshAccessToken('some-older-token')).resolves.toBe('access-login');
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it('does not refresh for a request that was sent before a token existed', async () => {
    const api = fakeApi();
    const manager = new TokenManager({ api, store: createMemorySessionStore(), owner: 'tg:1' });
    await manager.signInWithInitData('x');

    await expect(manager.refreshAccessToken(null)).resolves.toBe('access-login');
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it('never resurrects the session when a refresh completes after sign-out', async () => {
    let resolveRefresh: (value: TokenPair) => void = () => undefined;
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>(
        () =>
          new Promise<TokenPair>((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    });
    const store = createMemorySessionStore();
    const manager = new TokenManager({ api, store, owner: 'tg:1' });
    await manager.signInWithInitData('x');

    const refreshing = manager.refreshAccessToken('access-login');
    await manager.signOut();
    resolveRefresh(tokenPayload('late'));

    await expect(refreshing).resolves.toBeNull();
    expect(manager.hasSession()).toBe(false);
    expect(store.load('tg:1')).toBeNull();
    // The orphaned rotated token is revoked server-side.
    await vi.waitFor(() => {
      expect(api.logout).toHaveBeenCalledWith('refresh-late');
    });
  });

  it('discards a login that completes after sign-out', async () => {
    let resolveLogin: (value: TokenPair) => void = () => undefined;
    const api = fakeApi({
      loginWithTelegram: vi.fn<AuthApi['loginWithTelegram']>(
        () =>
          new Promise<TokenPair>((resolve) => {
            resolveLogin = resolve;
          }),
      ),
    });
    const manager = new TokenManager({ api, store: createMemorySessionStore(), owner: 'tg:1' });

    const signingIn = manager.signInWithInitData('x');
    manager.clear();
    resolveLogin(tokenPayload('late'));
    await signingIn;

    expect(manager.hasSession()).toBe(false);
    await vi.waitFor(() => {
      expect(api.logout).toHaveBeenCalledWith('refresh-late');
    });
  });

  it('clears the session and notifies listeners when the refresh token is rejected', async () => {
    const api = fakeApi({ refresh: vi.fn<AuthApi['refresh']>(() => Promise.reject(unauthorized())) });
    const store = createMemorySessionStore();
    const manager = new TokenManager({ api, store, owner: 'tg:1' });
    const onExpired = vi.fn();
    manager.onSessionExpired(onExpired);
    await manager.signInWithInitData('x');

    await expect(manager.refreshAccessToken('access-login')).resolves.toBeNull();

    expect(manager.hasSession()).toBe(false);
    expect(store.load('tg:1')).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('keeps the session on transient refresh failures', async () => {
    const api = fakeApi({ refresh: vi.fn<AuthApi['refresh']>(() => Promise.reject(new NetworkError('offline'))) });
    const manager = new TokenManager({ api, store: createMemorySessionStore(), owner: 'tg:1' });
    await manager.signInWithInitData('x');

    await expect(manager.refreshAccessToken('access-login')).rejects.toBeInstanceOf(NetworkError);
    expect(manager.getAccessToken()).toBe('access-login');
  });

  it('returns null from refresh when there is no session', async () => {
    const api = fakeApi();
    const manager = new TokenManager({ api, store: createMemorySessionStore(), owner: 'tg:1' });

    await expect(manager.refreshAccessToken(null)).resolves.toBeNull();
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it('signs out locally even if the logout request fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = fakeApi({ logout: vi.fn<AuthApi['logout']>(() => Promise.reject(new NetworkError('offline'))) });
    const manager = new TokenManager({ api, store: createMemorySessionStore(), owner: 'tg:1' });
    await manager.signInWithInitData('x');

    await manager.signOut();

    expect(api.logout).toHaveBeenCalledWith('refresh-login');
    expect(manager.hasSession()).toBe(false);
  });

  it('restores a persisted session only for the same owner', async () => {
    const store = createSessionStore(window.sessionStorage);
    const first = new TokenManager({ api: fakeApi(), store, owner: sessionOwnerKey(1) });
    await first.signInWithInitData('x');

    const sameUser = new TokenManager({ api: fakeApi(), store, owner: sessionOwnerKey(1) });
    expect(sameUser.restore()).toBe(true);
    expect(sameUser.getAccessToken()).toBe('access-login');

    const otherUser = new TokenManager({ api: fakeApi(), store, owner: sessionOwnerKey(2) });
    expect(otherUser.restore()).toBe(false);
    // The foreign session is discarded, not left behind.
    expect(window.sessionStorage.length).toBe(0);
  });

  it('ignores corrupted storage', () => {
    window.sessionStorage.setItem('utilityhub.session.v1', '{not json');
    const manager = new TokenManager({
      api: fakeApi(),
      store: createSessionStore(window.sessionStorage),
      owner: 'tg:1',
    });

    expect(manager.restore()).toBe(false);
  });
});
