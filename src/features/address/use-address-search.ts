'use client';

import { useCallback, useEffect, useState } from 'react';
import { isApiError } from '@/shared/api/errors';
import type { AddressSearch, SearchPage } from './api';

export type SearchFailure = 'unavailable' | 'generic';

export type SearchState<T> =
  /** No parent selected or the query is shorter than the API minimum: nothing is requested. */
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly page: SearchPage<T> }
  | { readonly status: 'error'; readonly failure: SearchFailure };

export const SEARCH_DEBOUNCE_MS = 300;

export function classifySearchError(error: unknown): SearchFailure {
  // 503: "Portmone is unavailable and no local … match"
  return isApiError(error, 503) ? 'unavailable' : 'generic';
}

interface StoredResult<T> {
  readonly key: string;
  readonly state: SearchState<T>;
}

interface UseAddressSearchOptions<T> {
  /** ID of the selected parent entity; `null` disables the search. */
  readonly parentId: string | null;
  readonly query: string;
  readonly minLength: number;
  readonly search: AddressSearch<T>;
  readonly debounceMs?: number;
}

/**
 * Debounced server-side search scoped to a parent entity.
 *
 * - Each request is identified by parent ID + trimmed query (+ retry counter). A result is shown only
 *   while its key is still current, so late responses for an old query or an old parent can never
 *   replace newer results.
 * - The in-flight request is aborted whenever the key changes or the component unmounts.
 * - Requests below the API's `minLength` or without a parent are never sent.
 */
export function useAddressSearch<T>({
  parentId,
  query,
  minLength,
  search,
  debounceMs = SEARCH_DEBOUNCE_MS,
}: UseAddressSearchOptions<T>): { readonly state: SearchState<T>; readonly retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<StoredResult<T> | null>(null);

  const term = query.trim();
  const key = parentId !== null && term.length >= minLength ? JSON.stringify([parentId, term, attempt]) : null;

  useEffect(() => {
    if (key === null || parentId === null) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      search(parentId, term, controller.signal).then(
        (page) => {
          if (!controller.signal.aborted) setResult({ key, state: { status: 'success', page } });
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setResult({ key, state: { status: 'error', failure: classifySearchError(error) } });
        },
      );
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, parentId, term, search, debounceMs]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  let state: SearchState<T>;
  if (key === null) state = { status: 'idle' };
  else if (result?.key === key) state = result.state;
  else state = { status: 'loading' };

  return { state, retry };
}
