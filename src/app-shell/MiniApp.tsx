'use client';

import dynamic from 'next/dynamic';
import type { AppConfig } from '@/config/env';
import { AuthLoadingScreen } from '@/features/auth/screens/AuthScreens';

/**
 * The Mini App depends on window.Telegram (initData, theme, viewport), which exists only in
 * the browser. It is therefore rendered client-side only; the server sends the loading screen,
 * so users see the app's own UI immediately after Telegram's splash.
 */
const ClientApp = dynamic(() => import('./ClientApp').then((module) => module.ClientApp), {
  ssr: false,
  loading: () => <AuthLoadingScreen />,
});

export function MiniApp({ config }: { readonly config: AppConfig }) {
  return <ClientApp config={config} />;
}
