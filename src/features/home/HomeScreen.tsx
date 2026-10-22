'use client';

import { LogOutIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  AddressSearch,
  SavedAddresses,
  createAddressApi,
  createUserAddressesApi,
  useSavedAddresses,
} from '@/features/address';
import type { CurrentUser } from '@/features/auth';
import { useI18n } from '@/i18n';
import { useApiClient } from '@/shared/api';

interface HomeScreenProps {
  readonly user: CurrentUser;
  readonly onSignOut: () => Promise<void>;
}

/**
 * Home screen for an authenticated user (rendered only after `/v1/auth/me` succeeded):
 * the saved addresses and the form to add a new one.
 */
export function HomeScreen({ user, onSignOut }: HomeScreenProps) {
  const { t } = useI18n();
  const client = useApiClient();
  const addressApi = useMemo(() => createAddressApi(client), [client]);
  const userAddressesApi = useMemo(() => createUserAddressesApi(client), [client]);
  const savedAddresses = useSavedAddresses(userAddressesApi);
  const [signingOut, setSigningOut] = useState(false);

  const fullName = [user.firstName, user.lastName].filter((part) => part !== null && part !== '').join(' ');

  const handleSignOut = (): void => {
    setSigningOut(true);
    void onSignOut().finally(() => {
      setSigningOut(false);
    });
  };

  return (
    <Screen>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-balance">
          {fullName === '' ? t('auth.success.greetingAnonymous') : t('auth.success.greeting', { name: fullName })}
        </h1>
        <Button
          variant="ghost"
          className="h-10 shrink-0"
          disabled={signingOut}
          focusableWhenDisabled={signingOut}
          aria-busy={signingOut || undefined}
          onClick={handleSignOut}
        >
          {signingOut ? (
            <Spinner data-icon="inline-start" aria-hidden="true" role={undefined} />
          ) : (
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {t('auth.success.signOut')}
        </Button>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">{t('addresses.title')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SavedAddresses state={savedAddresses.state} onRetry={savedAddresses.retry} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">{t('address.title')}</h2>
          </CardTitle>
          <CardDescription>{t('address.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <AddressSearch api={addressApi} onSubmit={userAddressesApi.save} onAdded={savedAddresses.add} />
        </CardContent>
      </Card>
    </Screen>
  );
}
