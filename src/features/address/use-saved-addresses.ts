'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedAddress, UserAddressesApi } from './user-addresses';

export type SavedAddressesState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'success'; readonly items: readonly SavedAddress[] };

interface Loaded {
  readonly attempt: number;
  readonly state: SavedAddressesState;
}

/**
 * The user's saved addresses: loaded once from `GET /v1/user-addresses`, then kept current with the
 * addresses returned by `POST` (no reload). Newly added addresses are listed first.
 */
export function useSavedAddresses(api: UserAddressesApi): {
  readonly state: SavedAddressesState;
  readonly retry: () => void;
  /** Adds a saved address; returns `false` if it was already listed (the backend returns existing ones). */
  readonly add: (address: SavedAddress) => boolean;
} {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [added, setAdded] = useState<readonly SavedAddress[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    api.list(controller.signal).then(
      (items) => {
        if (!controller.signal.aborted) setLoaded({ attempt, state: { status: 'success', items } });
      },
      () => {
        if (!controller.signal.aborted) setLoaded({ attempt, state: { status: 'error' } });
      },
    );
    return () => {
      controller.abort();
    };
  }, [api, attempt]);

  const current = loaded?.attempt === attempt ? loaded.state : ({ status: 'loading' } as const);

  let state: SavedAddressesState = current;
  if (current.status === 'success') {
    const addedIds = new Set(added.map((item) => item.id));
    state = { status: 'success', items: [...added, ...current.items.filter((item) => !addedIds.has(item.id))] };
  }

  // IDs currently listed. `add` is called after an awaited request, when the caller's render-time
  // snapshot may be stale, so it reads the latest committed list from this ref.
  const listedIds = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    listedIds.current = new Set(state.status === 'success' ? state.items.map((item) => item.id) : []);
  });

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const add = useCallback((address: SavedAddress): boolean => {
    const known = listedIds.current.has(address.id);
    listedIds.current = new Set([...listedIds.current, address.id]);
    setAdded((items) => [address, ...items.filter((item) => item.id !== address.id)]);
    return !known;
  }, []);

  return { state, retry, add };
}
