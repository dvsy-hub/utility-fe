'use client';

import { LogOutIcon, SendIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { Screen } from '@/components/screen';
import { StatusView } from '@/components/status-view';
import { buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { AuthFailure } from '../auth-controller';

export function AuthLoadingScreen() {
  const { t } = useI18n();
  return (
    <Screen centered>
      <StatusView
        // The live region (StatusView) announces the title; the spinner itself is decorative.
        icon={<Spinner aria-hidden="true" role={undefined} />}
        title={t('auth.loading.title')}
        description={t('auth.loading.description')}
      />
    </Screen>
  );
}

export function OutsideTelegramScreen({ botUrl }: { readonly botUrl: string | null }) {
  const { t } = useI18n();
  return (
    <Screen centered>
      <StatusView
        icon={<SendIcon aria-hidden="true" />}
        title={t('auth.unsupported.title')}
        description={t('auth.unsupported.description')}
        actions={
          botUrl === null ? undefined : (
            <a
              href={botUrl}
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: 'lg' }), 'h-11 w-full text-base')}
            >
              {t('auth.unsupported.openBot')}
            </a>
          )
        }
      />
    </Screen>
  );
}

interface AuthErrorScreenProps {
  readonly failure: AuthFailure;
  readonly onRetry: () => Promise<void>;
  /** Present only inside Telegram. */
  readonly onClose: (() => void) | null;
}

export function AuthErrorScreen({ failure, onRetry, onClose }: AuthErrorScreenProps) {
  const { t } = useI18n();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = (): void => {
    setRetrying(true);
    void onRetry().finally(() => {
      setRetrying(false);
    });
  };

  return (
    <Screen centered>
      <StatusView
        tone="error"
        icon={<TriangleAlertIcon aria-hidden="true" />}
        title={t('auth.error.title')}
        description={t(`auth.error.${failure.kind}`)}
        actions={
          <>
            {failure.retryable ? (
              <ActionButton loading={retrying} onClick={handleRetry}>
                {t('common.retry')}
              </ActionButton>
            ) : null}
            {onClose === null ? null : (
              <ActionButton variant={failure.retryable ? 'secondary' : 'default'} onClick={onClose}>
                {t('common.close')}
              </ActionButton>
            )}
          </>
        }
      />
    </Screen>
  );
}

export function SignedOutScreen({ onSignIn }: { readonly onSignIn: () => Promise<void> }) {
  const { t } = useI18n();
  return (
    <Screen centered>
      <StatusView
        icon={<LogOutIcon aria-hidden="true" />}
        title={t('auth.signedOut.title')}
        description={t('auth.signedOut.description')}
        actions={
          <ActionButton
            onClick={() => {
              void onSignIn();
            }}
          >
            {t('auth.signedOut.signIn')}
          </ActionButton>
        }
      />
    </Screen>
  );
}
