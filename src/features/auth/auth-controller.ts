import { ApiError, InvalidResponseError, NetworkError, TimeoutError, isApiError } from '@/shared/api/errors';
import type { LaunchContext } from '@/telegram/webapp';
import type { CurrentUser } from './api';
import type { TokenManager } from './token-manager';

export type AuthFailureKind =
  /** Backend rejected initData (bad signature, expired auth_date, malformed). */
  | 'invalid_init_data'
  /** Telegram account or user is disabled on the backend (403). */
  | 'account_inactive'
  /** Backend has Telegram auth switched off / misconfigured (503). */
  | 'auth_unavailable'
  | 'network'
  | 'timeout'
  | 'server'
  | 'unexpected';

export interface AuthFailure {
  readonly kind: AuthFailureKind;
  /** Whether repeating the same attempt can plausibly succeed. */
  readonly retryable: boolean;
  /** Technical detail for diagnostics; not meant for end users. */
  readonly debugMessage: string;
}

export type AuthState =
  | { readonly status: 'idle' }
  | { readonly status: 'unsupported' }
  | { readonly status: 'authenticating' }
  | { readonly status: 'authenticated'; readonly user: CurrentUser }
  | { readonly status: 'error'; readonly failure: AuthFailure }
  | { readonly status: 'signed_out' };

export interface AuthControllerDeps {
  /** `null` when the app was opened outside Telegram. */
  readonly launch: LaunchContext | null;
  readonly tokens: TokenManager;
  /** Authenticated call that proves the session works and returns the profile. */
  readonly fetchCurrentUser: () => Promise<CurrentUser>;
}

type Stage = 'login' | 'profile';

function failure(kind: AuthFailureKind, retryable: boolean, error: unknown): AuthFailure {
  return { kind, retryable, debugMessage: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
}

export function classifyAuthError(error: unknown, stage: Stage): AuthFailure {
  if (error instanceof TimeoutError) return failure('timeout', true, error);
  if (error instanceof NetworkError) return failure('network', true, error);
  if (error instanceof InvalidResponseError) return failure('unexpected', true, error);
  if (error instanceof ApiError) {
    if (stage === 'login' && (error.status === 401 || error.status === 400)) {
      // Re-sending the same initData cannot succeed; the user has to reopen the app.
      return failure('invalid_init_data', false, error);
    }
    if (error.status === 403) return failure('account_inactive', false, error);
    if (error.status === 503) return failure('auth_unavailable', true, error);
    if (error.status >= 500) return failure('server', true, error);
  }
  return failure('unexpected', true, error);
}

/**
 * Framework-agnostic auth state machine.
 *
 *   idle → unsupported                          (no initData: opened outside Telegram)
 *   idle → authenticating → authenticated       (restored session or initData exchange, then GET /me)
 *   idle → authenticating → error → (retry) …
 *   authenticated → signed_out → (retry) …
 *   authenticated → authenticating              (refresh token rejected mid-session → silent re-login)
 *
 * The user is considered authenticated only after the backend accepted the
 * session on a protected endpoint (GET /v1/auth/me) — never based on Telegram data alone.
 */
export class AuthController {
  readonly #deps: AuthControllerDeps;
  #state: AuthState = { status: 'idle' };
  #inFlight: Promise<void> | null = null;
  /** Incremented by signOut so a still-running attempt cannot overwrite the signed-out state. */
  #attempt = 0;
  readonly #listeners = new Set<() => void>();

  constructor(deps: AuthControllerDeps) {
    this.#deps = deps;
    deps.tokens.onSessionExpired(() => {
      if (this.#state.status === 'authenticated') void this.start();
    });
  }

  readonly getState = (): AuthState => this.#state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Idempotent: concurrent calls share one attempt; no-op once authenticated. */
  readonly start = (): Promise<void> => {
    if (this.#inFlight !== null) return this.#inFlight;
    if (this.#state.status === 'authenticated' && this.#deps.tokens.hasSession()) {
      return Promise.resolve();
    }
    const inFlight = this.#authenticate(this.#attempt).finally(() => {
      if (this.#inFlight === inFlight) this.#inFlight = null;
    });
    this.#inFlight = inFlight;
    return inFlight;
  };

  readonly retry = (): Promise<void> => this.start();

  readonly signOut = async (): Promise<void> => {
    this.#attempt += 1;
    this.#inFlight = null;
    await this.#deps.tokens.signOut();
    this.#setState({ status: 'signed_out' });
  };

  async #authenticate(attempt: number): Promise<void> {
    const { launch, tokens, fetchCurrentUser } = this.#deps;
    // An attempt superseded by signOut() must neither update state nor create a session.
    const superseded = (): boolean => attempt !== this.#attempt;
    const setState = (next: AuthState): void => {
      if (!superseded()) this.#setState(next);
    };

    if (launch === null) {
      setState({ status: 'unsupported' });
      return;
    }

    setState({ status: 'authenticating' });

    // 1. Reuse a session from earlier in this WebView (survives reloads with stale initData).
    if (tokens.hasSession() || tokens.restore()) {
      try {
        const user = await fetchCurrentUser(); // refreshes transparently on 401
        setState({ status: 'authenticated', user });
        return;
      } catch (error) {
        if (!isApiError(error, 401)) {
          setState({ status: 'error', failure: classifyAuthError(error, 'profile') });
          return;
        }
        if (superseded()) return;
        tokens.clear(); // session is dead; fall through to a fresh initData exchange
      }
    }
    if (superseded()) return;

    // 2. Exchange initData for a new session.
    try {
      await tokens.signInWithInitData(launch.initData);
    } catch (error) {
      setState({ status: 'error', failure: classifyAuthError(error, 'login') });
      return;
    }
    if (superseded()) return;

    // 3. Confirm the new session on a protected endpoint.
    try {
      const user = await fetchCurrentUser();
      setState({ status: 'authenticated', user });
    } catch (error) {
      setState({ status: 'error', failure: classifyAuthError(error, 'profile') });
    }
  }

  #setState(next: AuthState): void {
    this.#state = next;
    for (const listener of this.#listeners) listener();
  }
}
