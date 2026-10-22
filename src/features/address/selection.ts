import type { AddressEntity, HouseEntity } from './api';

/** The chosen entities per level. Labels are derived from the entities; only IDs go to the API. */
export interface AddressSelection {
  readonly area: AddressEntity | null;
  readonly city: AddressEntity | null;
  readonly street: AddressEntity | null;
  readonly house: HouseEntity | null;
  readonly apartment: AddressEntity | null;
}

export const ADDRESS_LEVELS = [
  'area',
  'city',
  'street',
  'house',
  'apartment',
] as const satisfies readonly (keyof AddressSelection)[];

export const emptySelection: AddressSelection = { area: null, city: null, street: null, house: null, apartment: null };

/**
 * Sets one level and clears every level after it (they belonged to the previous parent).
 * Re-selecting the same entity keeps the dependent levels.
 */
export function selectLevel<K extends keyof AddressSelection>(
  selection: AddressSelection,
  level: K,
  value: AddressSelection[K],
): AddressSelection {
  if (selection[level]?.id === value?.id) return selection;
  const next: Record<keyof AddressSelection, AddressEntity | null> = { ...selection, [level]: value };
  for (const deeper of ADDRESS_LEVELS.slice(ADDRESS_LEVELS.indexOf(level) + 1)) next[deeper] = null;
  return next as AddressSelection;
}

/** A house without apartments is a complete address; otherwise an apartment is required. */
export function isComplete({ house, apartment }: AddressSelection): boolean {
  return house !== null && (!house.hasApartments || apartment !== null);
}
