import type { Translate } from '@/i18n';
import { localizedName, type AddressEntity } from './api';

export interface AddressPath {
  readonly area: AddressEntity;
  readonly city: AddressEntity;
  readonly street: AddressEntity;
  readonly house: AddressEntity;
  /** Omitted from the text when `null` (a house without apartments). */
  readonly apartment: AddressEntity | null;
}

/** "Area, City, Street, буд. House[, кв. Apartment]" in the UI locale. */
export function formatAddress(path: AddressPath, t: Translate, locale: string): string {
  const name = (entity: AddressEntity): string => localizedName(entity.name, locale);
  return [
    name(path.area),
    name(path.city),
    name(path.street),
    t('address.selected.house', { number: name(path.house) }),
    ...(path.apartment === null ? [] : [t('address.selected.apartment', { number: name(path.apartment) })]),
  ].join(', ');
}
