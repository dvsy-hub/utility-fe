'use client';

import { createContext, use, useSyncExternalStore } from 'react';
import type { AuthController, AuthState } from './auth-controller';

export const AuthControllerContext = createContext<AuthController | null>(null);

export interface UseAuthResult {
  readonly state: AuthState;
  readonly retry: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const controller = use(AuthControllerContext);
  if (controller === null) throw new Error('useAuth must be used inside <AuthProvider>');
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  return { state, retry: controller.retry, signOut: controller.signOut };
}
