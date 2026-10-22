'use client';

import { useCallback } from 'react';
import {
  AuthErrorScreen,
  AuthLoadingScreen,
  OutsideTelegramScreen,
  SignedOutScreen,
} from '@/features/auth/screens/AuthScreens';
import { useAuth } from '@/features/auth';
import { HomeScreen } from '@/features/home/HomeScreen';
import type { TelegramWebApp } from '@/telegram/types';
import { closeMiniApp } from '@/telegram/webapp';

interface AuthGateProps {
  readonly webApp: TelegramWebApp | null;
  readonly botUrl: string | null;
}

/** Auth gate. The home screen (and future feature routes) render only in the `authenticated` branch. */
export function AuthGate({ webApp, botUrl }: AuthGateProps) {
  const { state, retry, signOut } = useAuth();
  const insideTelegram = webApp !== null && webApp.initData !== '';
  const close = useCallback(() => {
    closeMiniApp(webApp);
  }, [webApp]);

  switch (state.status) {
    case 'idle':
    case 'authenticating':
      return <AuthLoadingScreen />;
    case 'unsupported':
      return <OutsideTelegramScreen botUrl={botUrl} />;
    case 'error':
      return <AuthErrorScreen failure={state.failure} onRetry={retry} onClose={insideTelegram ? close : null} />;
    case 'signed_out':
      return <SignedOutScreen onSignIn={retry} />;
    case 'authenticated':
      return <HomeScreen user={state.user} onSignOut={signOut} />;
  }
}
