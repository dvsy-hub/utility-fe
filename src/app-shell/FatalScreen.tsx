'use client';

import { TriangleAlertIcon } from 'lucide-react';
import { ActionButton } from '@/components/action-button';
import { Screen } from '@/components/screen';
import { StatusView } from '@/components/status-view';
import { useI18n } from '@/i18n';

interface FatalScreenProps {
  /** Set when startup failed because of invalid configuration. */
  readonly configError?: boolean;
}

export function FatalScreen({ configError = false }: FatalScreenProps) {
  const { t } = useI18n();
  return (
    <Screen centered>
      <StatusView
        tone="error"
        icon={<TriangleAlertIcon aria-hidden="true" />}
        title={t('fatal.title')}
        description={configError ? t('fatal.config') : t('fatal.description')}
        actions={
          <ActionButton
            onClick={() => {
              window.location.reload();
            }}
          >
            {t('common.reload')}
          </ActionButton>
        }
      />
    </Screen>
  );
}
