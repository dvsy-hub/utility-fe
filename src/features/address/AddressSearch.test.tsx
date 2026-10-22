import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { ApiError, TimeoutError } from '@/shared/api/errors';
import type { AddressApi, AddressEntity, HouseEntity, SearchPage } from './api';
import { AddressSearch } from './AddressSearch';
import type { CreateUserAddress, SavedAddress } from './user-addresses';

const entity = (id: string, uk: string): AddressEntity => ({ id, name: { uk, ru: null, en: null } });
const pageOf = <T,>(items: T[], total = items.length): SearchPage<T> => ({ items, total });

const kyivArea = entity('area-kyiv', 'м. Київ');
const lvivArea = entity('area-lviv', 'Львівська');
const kyiv = entity('city-kyiv', 'Київ');
const street = entity('street-1', 'вул. Хрещатик');
const apartmentHouse: HouseEntity = { ...entity('house-1', '22'), hasApartments: true };
const privateHouse: HouseEntity = { ...entity('house-2', '5А'), hasApartments: false };
const apartment = entity('apt-1', '17');

function fakeApi(overrides: Partial<AddressApi> = {}) {
  return {
    listAreas: vi.fn<AddressApi['listAreas']>().mockResolvedValue(pageOf([kyivArea, lvivArea])),
    searchCities: vi.fn<AddressApi['searchCities']>().mockResolvedValue(pageOf([kyiv])),
    searchStreets: vi.fn<AddressApi['searchStreets']>().mockResolvedValue(pageOf([street])),
    searchHouses: vi.fn<AddressApi['searchHouses']>().mockResolvedValue(pageOf([apartmentHouse, privateHouse])),
    searchApartments: vi.fn<AddressApi['searchApartments']>().mockResolvedValue(pageOf([apartment])),
    ...overrides,
  } satisfies AddressApi;
}

/** What the backend returns for a saved address (full path; `apartment` null for houses). */
function savedFor(body: CreateUserAddress): SavedAddress {
  const house = body.type === 'apartment' ? apartmentHouse : privateHouse;
  return {
    id: `saved-${body.addressId}`,
    type: body.type,
    addressId: body.addressId,
    label: null,
    area: kyivArea,
    city: kyiv,
    street,
    house: { id: house.id, name: house.name },
    apartment: body.type === 'apartment' ? apartment : null,
  };
}

interface Options {
  readonly api?: AddressApi;
  readonly onSubmit?: (body: CreateUserAddress) => Promise<SavedAddress>;
  readonly onAdded?: (address: SavedAddress) => boolean;
}

function renderForm(options: Options = {}) {
  const user = userEvent.setup();
  const api = options.api ?? fakeApi();
  const onSubmit = vi.fn(options.onSubmit ?? ((body: CreateUserAddress) => Promise.resolve(savedFor(body))));
  const onAdded = vi.fn(options.onAdded ?? (() => true));
  render(
    <I18nProvider locale="uk">
      <AddressSearch api={api} onSubmit={onSubmit} onAdded={onAdded} />
    </I18nProvider>,
  );
  return { user, api, onSubmit, onAdded };
}

const field = (name: string) => screen.getByRole('combobox', { name });
const queryField = (name: string) => screen.queryByRole('combobox', { name });
const addButton = () => screen.getByRole('button', { name: 'Додати адресу' });

async function choose(user: ReturnType<typeof userEvent.setup>, fieldName: string, text: string, option: string) {
  await user.click(field(fieldName));
  await user.type(field(fieldName), text);
  await user.click(await screen.findByRole('option', { name: option }));
}

async function chooseUpToStreet(user: ReturnType<typeof userEvent.setup>) {
  await choose(user, 'Область', 'Київ', 'м. Київ');
  await choose(user, 'Місто', 'Київ', 'Київ');
  await choose(user, 'Вулиця', 'Хре', 'вул. Хрещатик');
}

describe('AddressSearch: progressive steps', () => {
  it('shows only the area step initially and reveals each next step after a selection', async () => {
    const { user, api } = renderForm();

    expect(field('Область')).toBeEnabled();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(addButton()).toBeDisabled();

    await choose(user, 'Область', 'київ', 'м. Київ');
    expect(field('Область')).toHaveValue('м. Київ');
    expect(field('Місто')).toBeEnabled();
    expect(queryField('Вулиця')).not.toBeInTheDocument();

    await user.click(field('Місто'));
    await user.type(field('Місто'), 'Ки');
    expect(await screen.findByText('Введіть щонайменше 3 символи.')).toBeInTheDocument();
    await user.type(field('Місто'), 'ї');
    await user.click(await screen.findByRole('option', { name: 'Київ' }));
    expect(api.searchCities).toHaveBeenCalledTimes(1);
    expect(api.searchCities).toHaveBeenCalledWith('area-kyiv', 'Киї', expect.any(AbortSignal));
    expect(field('Вулиця')).toBeInTheDocument();
    expect(queryField('Будинок')).not.toBeInTheDocument();

    await choose(user, 'Вулиця', 'Хре', 'вул. Хрещатик');
    expect(api.searchStreets).toHaveBeenCalledWith('city-kyiv', 'Хре', expect.any(AbortSignal));
    expect(field('Будинок')).toBeInTheDocument();
    expect(queryField('Квартира')).not.toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });

  it('does not reveal the next step for typed text that was not selected', async () => {
    const { user } = renderForm();
    await choose(user, 'Область', 'Київ', 'м. Київ');

    await user.click(field('Місто'));
    await user.type(field('Місто'), 'Київ');
    expect(await screen.findByRole('option', { name: 'Київ' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(queryField('Вулиця')).not.toBeInTheDocument();
  });

  it('supports keyboard selection', async () => {
    const { user } = renderForm();

    await user.click(field('Область'));
    await user.type(field('Область'), 'Львів');
    await screen.findByRole('option', { name: 'Львівська' });
    await user.keyboard('{Enter}');

    expect(field('Область')).toHaveValue('Львівська');
    expect(field('Місто')).toBeInTheDocument();
  });

  it('clears and hides dependent steps when a parent changes or is cleared', async () => {
    const { user } = renderForm();
    await chooseUpToStreet(user);
    expect(field('Будинок')).toBeInTheDocument();

    await user.clear(field('Область'));
    await user.type(field('Область'), 'Львів');
    await user.click(await screen.findByRole('option', { name: 'Львівська' }));

    // Back to the city step: the city is empty, street and house are gone.
    expect(field('Місто')).toHaveValue('');
    expect(queryField('Вулиця')).not.toBeInTheDocument();
    expect(queryField('Будинок')).not.toBeInTheDocument();

    await choose(user, 'Місто', 'Київ', 'Київ');
    const [clearArea] = screen.getAllByRole('button', { name: 'Очистити' });
    if (clearArea === undefined) throw new Error('The area field has no clear button');
    await user.click(clearArea);

    expect(field('Область')).toHaveValue('');
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('hides the apartment step again when a multi-apartment house is replaced by a private one', async () => {
    const { user } = renderForm();
    await chooseUpToStreet(user);
    await choose(user, 'Будинок', '2', '22');
    await choose(user, 'Квартира', '1', '17');

    await user.clear(field('Будинок'));
    await user.type(field('Будинок'), '5');
    await user.click(await screen.findByRole('option', { name: '5А' }));

    expect(queryField('Квартира')).not.toBeInTheDocument();
    expect(addButton()).toBeEnabled();
  });
});

describe('AddressSearch: houses and apartments', () => {
  it('requires an apartment for a multi-apartment house', async () => {
    const { user, api } = renderForm();
    await chooseUpToStreet(user);
    await choose(user, 'Будинок', '2', '22');

    expect(api.searchHouses).toHaveBeenCalledWith('street-1', '2', expect.any(AbortSignal));
    expect(field('Квартира')).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    expect(screen.getByText('Оберіть усі частини адреси, щоб її додати.')).toBeInTheDocument();

    await choose(user, 'Квартира', '1', '17');
    expect(api.searchApartments).toHaveBeenCalledWith('house-1', '1', expect.any(AbortSignal));
    expect(addButton()).toBeEnabled();
    expect(screen.getByText('м. Київ, Київ, вул. Хрещатик, буд. 22, кв. 17')).toBeInTheDocument();
  });

  it('does not render the apartment step for a private house; the address is complete', async () => {
    const { user, api } = renderForm();
    await chooseUpToStreet(user);
    await choose(user, 'Будинок', '5', '5А');

    expect(queryField('Квартира')).not.toBeInTheDocument();
    expect(addButton()).toBeEnabled();
    expect(screen.getByText('м. Київ, Київ, вул. Хрещатик, буд. 5А')).toBeInTheDocument();
    expect(api.searchApartments).not.toHaveBeenCalled();
  });
});

describe('AddressSearch: adding the address', () => {
  it('cannot submit an incomplete address', async () => {
    const { user, onSubmit } = renderForm();
    await chooseUpToStreet(user);
    await choose(user, 'Будинок', '2', '22');

    await user.click(addButton());

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the apartment ID for a multi-apartment house, then resets to the area step', async () => {
    const { user, onSubmit, onAdded } = renderForm();
    await chooseUpToStreet(user);
    await choose(user, 'Будинок', '2', '22');
    await choose(user, 'Квартира', '1', '17');

    await user.click(addButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ type: 'apartment', addressId: 'apt-1' });
    expect(onAdded).toHaveBeenCalledWith(savedFor({ type: 'apartment', addressId: 'apt-1' }));
    expect(await screen.findByText('Адресу додано: м. Київ, Київ, вул. Хрещатик, буд. 22, кв. 17')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(field('Область')).toHaveValue('');
    expect(addButton()).toBeDisabled();

    // Another address can be added right away.
    await choose(user, 'Область', 'Київ', 'м. Київ');
    expect(field('Місто')).toHaveValue('');
  });

  it('submits the house ID (and no apartment) for a private house', async () => {
    const { user, onSubmit } = renderForm();
    await chooseUpToStreet(user);
    await choose(user, 'Будинок', '5', '5А');

    await user.click(addButton());

    expect(onSubmit).toHaveBeenCalledWith({ type: 'house', addressId: 'house-2' });
  });

  it('tells the user when the address was already saved', async () => {
    const { user } = renderForm({ onAdded: () => false });
    await chooseUpToStreet(user);
    await choose(user, 'Будинок', '5', '5А');

    await user.click(addButton());

    expect(
      await screen.findByText('Ця адреса вже є у вашому списку: м. Київ, Київ, вул. Хрещатик, буд. 5А'),
    ).toBeInTheDocument();
  });

  it('keeps the selection after a failed submission and allows retrying', async () => {
    const onSubmit = vi
      .fn<(body: CreateUserAddress) => Promise<SavedAddress>>()
      .mockRejectedValueOnce(new ApiError({ status: 404, code: 404, message: 'House not found', details: null }))
      .mockRejectedValueOnce(new TimeoutError('timeout'))
      .mockImplementationOnce((body) => Promise.resolve(savedFor(body)));
    const { user, onAdded } = renderForm({ onSubmit });
    await chooseUpToStreet(user);
    await choose(user, 'Будинок', '5', '5А');

    await user.click(addButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Цієї адреси більше немає в довіднику');
    expect(field('Будинок')).toHaveValue('5А');
    expect(field('Вулиця')).toHaveValue('вул. Хрещатик');
    expect(addButton()).toBeEnabled();
    expect(onAdded).not.toHaveBeenCalled();

    await user.click(addButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('адресу не буде додано двічі');

    await user.click(addButton());
    expect(await screen.findByText('Адресу додано: м. Київ, Київ, вул. Хрещатик, буд. 5А')).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(3);
    expect(onSubmit.mock.calls.every(([body]) => body.type === 'house' && body.addressId === 'house-2')).toBe(true);
  });

  it('ignores repeated clicks while the request is in flight', async () => {
    let resolve: (value: SavedAddress) => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<SavedAddress>((done) => {
          resolve = done;
        }),
    );
    const { user } = renderForm({ onSubmit });
    await chooseUpToStreet(user);
    await choose(user, 'Будинок', '5', '5А');

    const button = addButton();
    await user.click(button);
    await user.click(button);
    await user.dblClick(button);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(field('Будинок')).toBeDisabled();

    resolve(savedFor({ type: 'house', addressId: 'house-2' }));
    expect(await screen.findByText(/^Адресу додано/)).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('AddressSearch: search states', () => {
  it('shows an empty state', async () => {
    const api = fakeApi({ searchCities: vi.fn<AddressApi['searchCities']>().mockResolvedValue(pageOf([])) });
    const { user } = renderForm({ api });
    await choose(user, 'Область', 'Київ', 'м. Київ');

    await user.click(field('Місто'));
    await user.type(field('Місто'), 'Ххх');

    expect(await screen.findByText('Нічого не знайдено. Спробуйте інший запит.')).toBeInTheDocument();
  });

  it('tells the user when only part of the matches is shown', async () => {
    const api = fakeApi({
      searchStreets: vi.fn<AddressApi['searchStreets']>().mockResolvedValue(pageOf([street], 57)),
    });
    const { user } = renderForm({ api });
    await choose(user, 'Область', 'Київ', 'м. Київ');
    await choose(user, 'Місто', 'Київ', 'Київ');

    await user.click(field('Вулиця'));
    await user.type(field('Вулиця'), 'вул');

    expect(await screen.findByText('Показано 1 з 57. Уточніть запит, щоб звузити список.')).toBeInTheDocument();
  });

  it('shows a search error and retries', async () => {
    const searchCities = vi
      .fn<AddressApi['searchCities']>()
      .mockRejectedValueOnce(new ApiError({ status: 503, code: 503, message: 'Portmone unavailable', details: null }))
      .mockResolvedValueOnce(pageOf([kyiv]));
    const { user } = renderForm({ api: fakeApi({ searchCities }) });
    await choose(user, 'Область', 'Київ', 'м. Київ');

    await user.click(field('Місто'));
    await user.type(field('Місто'), 'Київ');

    // The error is announced inside the open popup (live region) together with its retry action.
    expect(
      await screen.findByText('Довідник адрес тимчасово недоступний. Спробуйте трохи пізніше.'),
    ).toBeInTheDocument();
    expect(field('Місто')).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));

    expect(await screen.findByRole('option', { name: 'Київ' })).toBeInTheDocument();
    expect(searchCities).toHaveBeenCalledTimes(2);
    expect(searchCities).toHaveBeenLastCalledWith('area-kyiv', 'Київ', expect.any(AbortSignal));
    await user.click(screen.getByRole('option', { name: 'Київ' }));
    expect(field('Вулиця')).toBeInTheDocument();
  });

  it('retries loading the areas', async () => {
    const listAreas = vi
      .fn<AddressApi['listAreas']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(pageOf([kyivArea]));
    const { user } = renderForm({ api: fakeApi({ listAreas }) });

    expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося завантажити список областей.');
    await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));

    await choose(user, 'Область', 'Київ', 'м. Київ');
    expect(listAreas).toHaveBeenCalledTimes(2);
  });
});
