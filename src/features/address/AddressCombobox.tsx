'use client';

import { RotateCcwIcon } from 'lucide-react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { localizedName, type AddressEntity } from './api';
import type { SearchState } from './use-address-search';

interface AddressComboboxProps<T extends AddressEntity> {
  readonly id: string;
  readonly step: number;
  readonly label: string;
  readonly placeholder: string;
  readonly value: T | null;
  readonly onValueChange: (value: T | null) => void;
  readonly disabled: boolean;
  readonly state: SearchState<T>;
  readonly onRetry: () => void;
  /**
   * Server-side search: called with what the user types and nothing is filtered locally.
   * Without it the (complete) item list is filtered on the client.
   */
  readonly onQueryChange?: ((query: string) => void) | undefined;
  /** Popup hint while `state` is `idle` (query too short). */
  readonly idleHint?: string | undefined;
  readonly loadingHint: string;
  readonly errorMessage: string;
}

const isSameEntity = (item: AddressEntity, value: AddressEntity): boolean => item.id === value.id;

/**
 * One step of the address search. The selected value is always an entity returned by the API
 * (free text is never accepted); the input text is only a search query and a display label.
 */
export function AddressCombobox<T extends AddressEntity>({
  id,
  step,
  label,
  placeholder,
  value,
  onValueChange,
  disabled,
  state,
  onRetry,
  onQueryChange,
  idleHint,
  loadingHint,
  errorMessage,
}: AddressComboboxProps<T>) {
  const { t, locale } = useI18n();
  const items: readonly T[] = state.status === 'success' ? state.page.items : [];
  const remote = onQueryChange !== undefined;
  const errorId = `${id}-error`;
  const failed = state.status === 'error';
  // A server-search error belongs to the typed query, which Base UI discards when the popup closes, so its
  // retry lives inside the popup. The (query-independent) area list error stays visible under the field.
  const persistentError = failed && !remote && !disabled;

  const retryButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 shrink-0"
      // Keep focus (and the popup) on the input when retrying from inside the popup.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onRetry}
    >
      <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
      {t('common.retry')}
    </Button>
  );

  let status: string | null = null;
  if (state.status === 'idle') status = idleHint ?? null;
  else if (state.status === 'loading') status = loadingHint;
  else if (state.status === 'error') status = errorMessage;
  else if (remote && state.page.total > items.length) {
    status = t('address.search.more', { shown: items.length, total: state.page.total });
  }

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id} className="gap-2">
        <span
          aria-hidden="true"
          className="flex size-5 items-center justify-center rounded-full bg-secondary text-xs text-secondary-foreground tabular-nums"
        >
          {step}
        </span>
        {label}
      </FieldLabel>
      <Combobox<T>
        items={items}
        value={value}
        onValueChange={(next) => {
          onValueChange(next);
        }}
        itemToStringLabel={(item) => localizedName(item.name, locale)}
        isItemEqualToValue={isSameEntity}
        // Results are already filtered by the server; locally only the full area list is filtered.
        {...(remote ? { filter: null } : {})}
        onInputValueChange={(inputValue, details) => {
          // Only typing is a search query. Programmatic updates (the selected label being written into
          // the input on select/close) must not trigger a request.
          if (!remote) return;
          onQueryChange(details.reason === 'input-change' ? inputValue : '');
        }}
        disabled={disabled}
        autoHighlight
      >
        <ComboboxInput
          id={id}
          // Explicit name: while the popup is open Base UI hides everything outside it (incl. the <label>)
          // from assistive tech, which would leave the input unnamed.
          aria-label={label}
          placeholder={placeholder}
          disabled={disabled}
          showClear
          triggerLabel={t('address.open')}
          clearLabel={t('address.clear')}
          enterKeyHint="search"
          aria-invalid={failed || undefined}
          aria-describedby={persistentError ? errorId : undefined}
          className="h-11"
        />
        <ComboboxContent>
          <ComboboxPrimitive.Status
            className={cn('px-3 py-2 text-sm text-muted-foreground empty:hidden', failed && 'text-destructive')}
          >
            {status}
          </ComboboxPrimitive.Status>
          {failed && remote ? <div className="px-2 pb-2">{retryButton}</div> : null}
          <ComboboxEmpty>{state.status === 'success' ? t('address.search.empty') : null}</ComboboxEmpty>
          <ComboboxList>
            {(item: T) => (
              <ComboboxItem key={item.id} value={item} className="min-h-10 text-base sm:text-sm">
                {localizedName(item.name, locale)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {persistentError ? (
        <div className="flex items-center justify-between gap-3">
          <FieldError id={errorId}>{errorMessage}</FieldError>
          {retryButton}
        </div>
      ) : null}
    </Field>
  );
}
