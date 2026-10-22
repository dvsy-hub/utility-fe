import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import type { AddressEntity, AddressSearch, SearchPage } from './api';
import { SEARCH_DEBOUNCE_MS, useAddressSearch } from './use-address-search';

const page = (...ids: string[]): SearchPage<AddressEntity> => ({
  items: ids.map((id) => ({ id, name: { uk: id, ru: null, en: null } })),
  total: ids.length,
});

interface Call {
  readonly parentId: string;
  readonly search: string;
  readonly signal: AbortSignal;
  readonly resolve: (value: SearchPage<AddressEntity>) => void;
  readonly reject: (error: unknown) => void;
}

/** A search function whose requests are settled manually, in any order. */
function controllableSearch() {
  const calls: Call[] = [];
  const search = vi.fn<AddressSearch<AddressEntity>>(
    (parentId, term, signal) =>
      new Promise((resolve, reject) => {
        calls.push({ parentId, search: term, signal, resolve, reject });
      }),
  );
  return { search, calls };
}

interface Props {
  readonly parentId: string | null;
  readonly query: string;
}

function setup(initial: Props, minLength = 3) {
  const { search, calls } = controllableSearch();
  const hook = renderHook((props: Props) => useAddressSearch({ ...props, minLength, search }), {
    initialProps: initial,
  });
  return { ...hook, search, calls };
}

async function elapse(ms = SEARCH_DEBOUNCE_MS) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

async function settle(fn: () => void) {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
}

describe('useAddressSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not search without a parent or below the minimum length', async () => {
    const { result, rerender, search } = setup({ parentId: null, query: 'Київ' });
    await elapse();
    expect(result.current.state).toEqual({ status: 'idle' });

    rerender({ parentId: 'area-1', query: ' Ки ' });
    await elapse();
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(search).not.toHaveBeenCalled();
  });

  it('debounces typing into a single request with the trimmed query', async () => {
    const { result, rerender, search, calls } = setup({ parentId: 'area-1', query: 'Ки' });

    rerender({ parentId: 'area-1', query: 'Киї' });
    await elapse(100);
    rerender({ parentId: 'area-1', query: 'Київ ' });
    expect(result.current.state).toEqual({ status: 'loading' });
    await elapse(SEARCH_DEBOUNCE_MS - 1);
    expect(search).not.toHaveBeenCalled();
    await elapse(1);

    expect(search).toHaveBeenCalledTimes(1);
    expect(calls[0]).toMatchObject({ parentId: 'area-1', search: 'Київ' });

    await settle(() => {
      calls[0]?.resolve(page('kyiv'));
    });
    expect(result.current.state).toEqual({ status: 'success', page: page('kyiv') });
  });

  it('aborts the previous request and ignores its late response', async () => {
    const { result, rerender, calls } = setup({ parentId: 'area-1', query: 'Льв' });
    await elapse();
    rerender({ parentId: 'area-1', query: 'Луц' });
    await elapse();

    expect(calls).toHaveLength(2);
    expect(calls[0]?.signal.aborted).toBe(true);

    await settle(() => {
      calls[1]?.resolve(page('lutsk'));
    });
    await settle(() => {
      calls[0]?.resolve(page('lviv'));
    });
    expect(result.current.state).toEqual({ status: 'success', page: page('lutsk') });
  });

  it('never shows results of a previous parent', async () => {
    const { result, rerender, calls } = setup({ parentId: 'area-1', query: 'Іва' });
    await elapse();
    await settle(() => {
      calls[0]?.resolve(page('city-of-area-1'));
    });

    rerender({ parentId: 'area-2', query: 'Іва' });
    expect(result.current.state).toEqual({ status: 'loading' });
    await elapse();
    expect(calls[1]?.parentId).toBe('area-2');
  });

  it('reports a 503 as unavailable and retries on demand', async () => {
    const { result, calls } = setup({ parentId: 'area-1', query: 'Київ' });
    await elapse();
    await settle(() => {
      calls[0]?.reject(new ApiError({ status: 503, code: 503, message: 'Portmone is unavailable', details: null }));
    });
    expect(result.current.state).toEqual({ status: 'error', failure: 'unavailable' });

    act(() => {
      result.current.retry();
    });
    expect(result.current.state).toEqual({ status: 'loading' });
    await elapse();
    expect(calls).toHaveLength(2);
    await settle(() => {
      calls[1]?.reject(new Error('boom'));
    });
    expect(result.current.state).toEqual({ status: 'error', failure: 'generic' });
  });

  it('aborts the in-flight request on unmount', async () => {
    const { unmount, calls } = setup({ parentId: 'area-1', query: 'Київ' });
    await elapse();
    unmount();
    expect(calls[0]?.signal.aborted).toBe(true);
  });
});
