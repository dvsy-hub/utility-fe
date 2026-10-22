'use client';

import { CircleCheckIcon, PlusIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldGroup } from '@/components/ui/field';
import { useI18n, type Translate } from '@/i18n';
import { NetworkError, TimeoutError, isApiError } from '@/shared/api/errors';
import { AddressCombobox } from './AddressCombobox';
import {
  SEARCH_MIN_LENGTH,
  type AddressApi,
  type AddressEntity,
  type AddressSearch as SearchFn,
  type HouseEntity,
} from './api';
import { formatAddress } from './format';
import { emptySelection, isComplete, selectLevel, type AddressSelection } from './selection';
import { useAddressSearch } from './use-address-search';
import { useAreas } from './use-areas';
import { toCreateUserAddress, type CreateUserAddress, type SavedAddress } from './user-addresses';

interface SearchStepProps<T extends AddressEntity> {
  readonly id: string;
  readonly step: number;
  readonly label: string;
  readonly placeholder: string;
  readonly parent: AddressEntity;
  readonly search: SearchFn<T>;
  readonly minLength: number;
  readonly value: T | null;
  readonly onValueChange: (value: T | null) => void;
  /** Temporarily read-only (while the address is being submitted). */
  readonly locked: boolean;
}

/**
 * A server-searched step. Rendered only once its parent is selected and keyed by the parent's ID, so its
 * query and results never outlive the parent.
 */
function SearchStep<T extends AddressEntity>({ parent, search, minLength, locked, ...props }: SearchStepProps<T>) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const { state, retry } = useAddressSearch({ parentId: parent.id, query, minLength, search });

  return (
    <AddressCombobox
      {...props}
      disabled={locked}
      state={state}
      onRetry={retry}
      onQueryChange={setQuery}
      idleHint={minLength <= 1 ? t('address.search.typeToSearch') : t('address.search.minChars', { count: minLength })}
      loadingHint={t('address.search.loading')}
      errorMessage={
        state.status === 'error' && state.failure === 'unavailable'
          ? t('address.search.unavailable')
          : t('address.search.error')
      }
    />
  );
}

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'done'; readonly message: string };

function submitErrorMessage(error: unknown, t: Translate): string {
  if (isApiError(error, 404)) return t('address.submit.error.notFound');
  if (isApiError(error, 400)) return t('address.submit.error.invalid');
  if (error instanceof TimeoutError) return t('address.submit.error.timeout');
  if (error instanceof NetworkError) return t('address.submit.error.network');
  return t('address.submit.error.generic');
}

interface AddressSearchProps {
  readonly api: AddressApi;
  /** Saves the address (`POST /v1/user-addresses`). */
  readonly onSubmit: (body: CreateUserAddress) => Promise<SavedAddress>;
  /** Called with the saved address; returns `false` when it was already in the user's list. */
  readonly onAdded: (address: SavedAddress) => boolean;
}

/**
 * Progressive address form: Area → City → Street → House → Apartment, each step rendered only after the
 * previous one has a selected entity. The apartment step exists only for houses with `hasApartments`.
 * Changing or clearing a step clears (and hides) every step after it.
 *
 * "Додати адресу" is enabled only for a complete address. On success the form resets to the area step; on
 * failure the selection is kept so the user can retry.
 */
export function AddressSearch({ api, onSubmit, onAdded }: AddressSearchProps) {
  const { t, locale } = useI18n();
  const [selection, setSelection] = useState<AddressSelection>(emptySelection);
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' });
  /** Remounts every step after a successful submission, so no input keeps stale text. */
  const [formKey, setFormKey] = useState(0);
  /** Synchronous guard: blocks a second submission before React re-renders the disabled button. */
  const inFlight = useRef(false);
  const areas = useAreas(api);
  const { area, city, street, house, apartment } = selection;
  const submitting = submit.status === 'submitting';
  const payload = toCreateUserAddress(selection);

  const select =
    <K extends keyof AddressSelection>(level: K) =>
    (value: AddressSelection[K]) => {
      setSelection((current) => selectLevel(current, level, value));
      // A status about the previous address is stale once the selection changes.
      setSubmit((current) => (current.status === 'submitting' ? current : { status: 'idle' }));
    };

  const handleSubmit = (): void => {
    if (payload === null || inFlight.current) return;
    inFlight.current = true;
    setSubmit({ status: 'submitting' });
    onSubmit(payload).then(
      (saved) => {
        inFlight.current = false;
        const isNew = onAdded(saved);
        const address = formatAddress(saved, t, locale);
        setSelection(emptySelection);
        setFormKey((key) => key + 1);
        setSubmit({
          status: 'done',
          message: isNew ? t('address.submit.added', { address }) : t('address.submit.duplicate', { address }),
        });
      },
      (error: unknown) => {
        inFlight.current = false;
        setSubmit({ status: 'failed', message: submitErrorMessage(error, t) });
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup key={formKey}>
        <AddressCombobox
          id="address-area"
          step={1}
          label={t('address.area.label')}
          placeholder={t('address.area.placeholder')}
          value={area}
          onValueChange={select('area')}
          disabled={submitting}
          state={areas.state}
          onRetry={areas.retry}
          loadingHint={t('address.areas.loading')}
          errorMessage={t('address.areas.error')}
        />
        {area === null ? null : (
          <SearchStep
            key={`city:${area.id}`}
            id="address-city"
            step={2}
            label={t('address.city.label')}
            placeholder={t('address.city.placeholder')}
            parent={area}
            search={api.searchCities}
            minLength={SEARCH_MIN_LENGTH.city}
            value={city}
            onValueChange={select('city')}
            locked={submitting}
          />
        )}
        {city === null ? null : (
          <SearchStep
            key={`street:${city.id}`}
            id="address-street"
            step={3}
            label={t('address.street.label')}
            placeholder={t('address.street.placeholder')}
            parent={city}
            search={api.searchStreets}
            minLength={SEARCH_MIN_LENGTH.street}
            value={street}
            onValueChange={select('street')}
            locked={submitting}
          />
        )}
        {street === null ? null : (
          <SearchStep<HouseEntity>
            key={`house:${street.id}`}
            id="address-house"
            step={4}
            label={t('address.house.label')}
            placeholder={t('address.house.placeholder')}
            parent={street}
            search={api.searchHouses}
            minLength={SEARCH_MIN_LENGTH.house}
            value={house}
            onValueChange={select('house')}
            locked={submitting}
          />
        )}
        {house?.hasApartments === true ? (
          <SearchStep
            key={`apartment:${house.id}`}
            id="address-apartment"
            step={5}
            label={t('address.apartment.label')}
            placeholder={t('address.apartment.placeholder')}
            parent={house}
            search={api.searchApartments}
            minLength={SEARCH_MIN_LENGTH.apartment}
            value={apartment}
            onValueChange={select('apartment')}
            locked={submitting}
          />
        ) : null}
      </FieldGroup>

      <div className="flex flex-col gap-3">
        {isComplete(selection) && area !== null && city !== null && street !== null && house !== null ? (
          <p className="text-sm text-muted-foreground">
            {formatAddress({ area, city, street, house, apartment }, t, locale)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('address.submit.incomplete')}</p>
        )}
        <ActionButton disabled={payload === null} loading={submitting} onClick={handleSubmit}>
          {submitting ? null : <PlusIcon data-icon="inline-start" aria-hidden="true" />}
          {t('address.submit')}
        </ActionButton>
        {submit.status === 'failed' ? (
          <Alert variant="destructive">
            <AlertDescription>{submit.message}</AlertDescription>
          </Alert>
        ) : null}
        {submit.status === 'done' ? (
          <Alert role="status">
            <CircleCheckIcon aria-hidden="true" />
            <AlertDescription>{submit.message}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
