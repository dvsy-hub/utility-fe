'use client';

import { useEffect } from 'react';
import { FatalScreen } from '@/app-shell/FatalScreen';

/** Last-resort fallback for unexpected render errors. Auth/network failures are handled as state. */
export default function ErrorPage({ error }: { readonly error: unknown }) {
  useEffect(() => {
    // Hook an error reporter (e.g. Sentry) here when one is introduced.
    console.error('[app] Unhandled error', error);
  }, [error]);

  return <FatalScreen />;
}
