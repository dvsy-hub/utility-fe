import { describe, expect, it } from 'vitest';
import type { AddressEntity, HouseEntity } from './api';
import { emptySelection, isComplete, selectLevel, type AddressSelection } from './selection';

const entity = (id: string): AddressEntity => ({ id, name: { uk: id, ru: null, en: null } });
const house = (id: string, hasApartments: boolean): HouseEntity => ({ ...entity(id), hasApartments });

const full: AddressSelection = {
  area: entity('area'),
  city: entity('city'),
  street: entity('street'),
  house: house('house', true),
  apartment: entity('apt'),
};

describe('selectLevel', () => {
  it('clears every level after the changed one', () => {
    expect(selectLevel(full, 'city', entity('city-2'))).toEqual({
      ...emptySelection,
      area: full.area,
      city: entity('city-2'),
    });
  });

  it('clears dependents when a level is cleared', () => {
    expect(selectLevel(full, 'area', null)).toEqual(emptySelection);
    expect(selectLevel(full, 'house', null)).toEqual({ ...full, house: null, apartment: null });
  });

  it('keeps dependents when the same entity is selected again', () => {
    expect(selectLevel(full, 'street', entity('street'))).toBe(full);
  });
});

describe('isComplete', () => {
  it('requires an apartment only for houses with apartments', () => {
    expect(isComplete(emptySelection)).toBe(false);
    expect(isComplete({ ...full, apartment: null })).toBe(false);
    expect(isComplete(full)).toBe(true);
    expect(isComplete({ ...full, house: house('private', false), apartment: null })).toBe(true);
  });
});
