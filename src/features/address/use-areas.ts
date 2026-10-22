'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AddressApi, AddressEntity } from './api';
import { classifySearchError, type SearchState } from './use-address-search';

/**
 * Areas are a small seeded list (the API serves all of them in one page), so they are loaded once
 * and filtered on the client instead of searched on every keystroke.
 */
export function useAreas(api: AddressApi): { readonly state: SearchState<AddressEntity>; readonly retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ readonly attempt: number; readonly state: SearchState<AddressEntity> } | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    api.listAreas(controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) setResult({ attempt, state: { status: 'success', page } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ attempt, state: { status: 'error', failure: classifySearchError(error) } });
        }
      },
    );
    return () => {
      controller.abort();
    };
  }, [api, attempt]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const state: SearchState<AddressEntity> = result?.attempt === attempt ? result.state : { status: 'loading' };
  return { state, retry };
}
