import type { AccessTokenProvider } from '@/shared/api/http-client';
import { ApiError } from '@/shared/api/errors';
import type { AuthApi, TokenPair } from './api';
import type { SessionStore } from './session-store';

export interface TokenManagerOptions {
  readonly api: AuthApi;
  readonly store: SessionStore;
  /** Partition key for the persisted session (see SessionStore). */
  readonly owner: string;
}

/**
 * Owns the backend session tokens: issue (initData exchange), rotation (refresh),
 * persistence and revocation. Implements AccessTokenProvider for the HTTP client.
 *
 * Refresh is single-flight: concurrent 401s share one refresh call, which matters
 * because the backend rotates the refresh token on every use.
 *
 * Every `clear()` (sign-out, expiry) starts a new "generation". Results of requests
 * started in an older generation are discarded (and revoked), so a refresh or login
 * that completes after sign-out can never resurrect the session.
 */
export class TokenManager implements AccessTokenProvider {
  readonly #api: AuthApi;
  readonly #store: SessionStore;
  readonly #owner: string;
  #tokens: TokenPair | null = null;
  #refreshInFlight: Promise<string | null> | null = null;
  #generation = 0;
  readonly #expiredListeners = new Set<() => void>();

  constructor({ api, store, owner }: TokenManagerOptions) {
    this.#api = api;
    this.#store = store;
    this.#owner = owner;
  }

  getAccessToken(): string | null {
    return this.#tokens?.accessToken ?? null;
  }

  hasSession(): boolean {
    return this.#tokens !== null;
  }

  /** Loads a session persisted earlier in this WebView. Returns whether one was found. */
  restore(): boolean {
    this.#tokens = this.#store.load(this.#owner);
    return this.#tokens !== null;
  }

  /** Exchanges raw Telegram initData for a backend session. */
  async signInWithInitData(initData: string): Promise<void> {
    const generation = this.#generation;
    const tokens = await this.#api.loginWithTelegram(initData);
    if (generation !== this.#generation) {
      void this.#revoke(tokens.refreshToken); // superseded by sign-out while in flight
      return;
    }
    this.#setTokens(tokens);
  }

  refreshAccessToken(rejectedToken: string | null): Promise<string | null> {
    const current = this.#tokens;
    if (current === null) return Promise.resolve(null);
    // The request was sent with an older token (or none): the current one has not been rejected yet.
    if (rejectedToken !== current.accessToken) return Promise.resolve(current.accessToken);
    if (this.#refreshInFlight !== null) return this.#refreshInFlight;

    const inFlight = this.#refresh(current.refreshToken).finally(() => {
      if (this.#refreshInFlight === inFlight) this.#refreshInFlight = null;
    });
    this.#refreshInFlight = inFlight;
    return inFlight;
  }

  /** Clears local state first, then revokes server-side (best effort). */
  async signOut(): Promise<void> {
    const refreshToken = this.#tokens?.refreshToken ?? null;
    this.clear();
    if (refreshToken !== null) await this.#revoke(refreshToken);
  }

  clear(): void {
    this.#generation += 1;
    this.#tokens = null;
    this.#refreshInFlight = null;
    this.#store.clear();
  }

  /** Fires when the session can no longer be renewed (refresh token rejected). */
  onSessionExpired(listener: () => void): () => void {
    this.#expiredListeners.add(listener);
    return () => {
      this.#expiredListeners.delete(listener);
    };
  }

  async #refresh(refreshToken: string): Promise<string | null> {
    const generation = this.#generation;
    try {
      const tokens = await this.#api.refresh(refreshToken);
      if (generation !== this.#generation) {
        void this.#revoke(tokens.refreshToken); // session was cleared meanwhile
        return null;
      }
      this.#setTokens(tokens);
      return tokens.accessToken;
    } catch (error) {
      if (generation !== this.#generation) return null;
      if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
        this.clear();
        for (const listener of this.#expiredListeners) listener();
        return null;
      }
      // Network/5xx: keep the session, the caller surfaces the error and may retry.
      throw error;
    }
  }

  /** Best effort: an unrevoked refresh token simply expires server-side. */
  async #revoke(refreshToken: string): Promise<void> {
    try {
      await this.#api.logout(refreshToken);
    } catch (error) {
      console.warn('[auth] Logout request failed', error);
    }
  }

  #setTokens(tokens: TokenPair): void {
    this.#tokens = tokens;
    this.#store.save(this.#owner, tokens);
  }
}

export function sessionOwnerKey(hintUserId: number | null): string {
  return hintUserId === null ? 'tg:unknown' : `tg:${String(hintUserId)}`;
}
