'use client';

import { HomeIcon, MapPinIcon } from 'lucide-react';
import { ActionButton } from '@/components/action-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/i18n';
import { formatAddress } from './format';
import type { SavedAddressesState } from './use-saved-addresses';

interface SavedAddressesProps {
  readonly state: SavedAddressesState;
  readonly onRetry: () => void;
}

/** List of the user's saved addresses with loading, empty and error states. */
export function SavedAddresses({ state, onRetry }: SavedAddressesProps) {
  const { t, locale } = useI18n();

  switch (state.status) {
    case 'loading':
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" role={undefined} />
          {t('addresses.loading')}
        </p>
      );
    case 'error':
      return (
        <div className="flex flex-col gap-3">
          <Alert variant="destructive">
            <AlertDescription>{t('addresses.error')}</AlertDescription>
          </Alert>
          <ActionButton variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </ActionButton>
        </div>
      );
    case 'success':
      if (state.items.length === 0) {
        return (
          <div role="status" className="flex flex-col items-center gap-1 py-2 text-center">
            <HomeIcon aria-hidden="true" className="mb-1 size-6 text-muted-foreground" />
            <p className="font-medium">{t('addresses.empty.title')}</p>
            <p className="text-sm text-balance text-muted-foreground">{t('addresses.empty.description')}</p>
          </div>
        );
      }
      return (
        <ul className="flex flex-col divide-y divide-border" aria-label={t('addresses.title')}>
          {state.items.map((address) => (
            <li key={address.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <MapPinIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="text-sm">
                {address.label === null ? null : <span className="block font-medium">{address.label}</span>}
                {formatAddress(address, t, locale)}
              </span>
            </li>
          ))}
        </ul>
      );
  }
}
