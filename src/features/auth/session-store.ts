import type { TokenPair } from './api';

/**
 * Persists the backend session for the lifetime of the Mini App WebView only.
 *
 * Why sessionStorage:
 * - The backend returns tokens in the response body (no httpOnly cookie), so a
 *   JS-readable store is unavoidable.
 * - Fresh `initData` is delivered on every launch, so long-lived persistence
 *   (localStorage) adds risk without benefit. sessionStorage survives reloads
 *   (where initData may already be stale) and is dropped when the WebView closes.
 *
 * The `owner` key (derived from the unverified Telegram user id) only prevents
 * reusing one account's tokens for another account in the same browser context
 * (e.g. account switching on web.telegram.org). It is not a security control:
 * every restored session is validated by the backend before use.
 */
export interface SessionStore {
  load(owner: string): TokenPair | null;
  save(owner: string, tokens: TokenPair): void;
  clear(): void;
}

const STORAGE_KEY = 'utilityhub.session.v1';

interface StoredSession {
  readonly owner: string;
  readonly tokens: TokenPair;
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const { owner, tokens } = value as Record<string, unknown>;
  if (typeof owner !== 'string' || typeof tokens !== 'object' || tokens === null) return false;
  const { accessToken, refreshToken } = tokens as Record<string, unknown>;
  return typeof accessToken === 'string' && typeof refreshToken === 'string';
}

/** Some embedded WebViews throw on storage access; treat that as "no storage". */
export function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function createSessionStore(storage: Storage | null): SessionStore {
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  return {
    load(owner) {
      if (storage === null) return null;
      const raw = safe(() => storage.getItem(STORAGE_KEY), null);
      if (raw === null) return null;
      const parsed: unknown = safe(() => JSON.parse(raw) as unknown, null);
      if (!isStoredSession(parsed) || parsed.owner !== owner) {
        safe(() => {
          storage.removeItem(STORAGE_KEY);
        }, undefined);
        return null;
      }
      return parsed.tokens;
    },
    save(owner, tokens) {
      if (storage === null) return;
      const value: StoredSession = { owner, tokens };
      safe(() => {
        storage.setItem(STORAGE_KEY, JSON.stringify(value));
      }, undefined);
    },
    clear() {
      if (storage === null) return;
      safe(() => {
        storage.removeItem(STORAGE_KEY);
      }, undefined);
    },
  };
}

/** In-memory store for environments without Web Storage (and for tests). */
export function createMemorySessionStore(): SessionStore {
  let current: StoredSession | null = null;
  return {
    load: (owner) => (current?.owner === owner ? current.tokens : null),
    save: (owner, tokens) => {
      current = { owner, tokens };
    },
    clear: () => {
      current = null;
    },
  };
}
