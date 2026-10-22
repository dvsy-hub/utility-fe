'use client';

import { createContext, use } from 'react';
import type { HttpClient } from './http-client';

export const ApiClientContext = createContext<HttpClient | null>(null);

/**
 * The authenticated API client for feature code. Requests carry the Bearer token
 * and transparently refresh it once on 401.
 */
export function useApiClient(): HttpClient {
  const client = use(ApiClientContext);
  if (client === null) throw new Error('useApiClient must be used inside <AppProviders>');
  return client;
}
