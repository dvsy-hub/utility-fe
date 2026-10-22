'use client';

import { useEffect, type ReactNode } from 'react';
import type { AuthController } from './auth-controller';
import { AuthControllerContext } from './use-auth';

interface AuthProviderProps {
  readonly controller: AuthController;
  readonly children: ReactNode;
}

/** Starts authentication on mount. `start()` is idempotent, so StrictMode double-effects are harmless. */
export function AuthProvider({ controller, children }: AuthProviderProps) {
  useEffect(() => {
    void controller.start();
  }, [controller]);

  return <AuthControllerContext value={controller}>{children}</AuthControllerContext>;
}
