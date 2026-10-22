/**
 * Source-of-truth dictionary (Ukrainian is the default locale).
 * Every other locale must provide exactly the same keys — enforced by the type checker.
 * Placeholders use `{name}` syntax.
 */
export const uk = {
  'app.name': 'UtilityHub',

  'common.retry': 'Спробувати ще раз',
  'common.close': 'Закрити',
  'common.reload': 'Перезавантажити',

  'auth.loading.title': 'Вхід через Telegram',
  'auth.loading.description': 'Перевіряємо ваш акаунт…',

  'auth.unsupported.title': 'Відкрийте застосунок у Telegram',
  'auth.unsupported.description':
    'UtilityHub працює як Telegram Mini App. Відкрийте його через нашого бота, щоб увійти.',
  'auth.unsupported.openBot': 'Відкрити в Telegram',

  'auth.success.title': 'Ви увійшли',
  'auth.success.greeting': 'Вітаємо, {name}!',
  'auth.success.greetingAnonymous': 'Вітаємо!',
  'auth.success.signOut': 'Вийти',

  'auth.signedOut.title': 'Ви вийшли з акаунта',
  'auth.signedOut.description': 'Сесію на цьому пристрої завершено.',
  'auth.signedOut.signIn': 'Увійти знову',

  'auth.error.title': 'Не вдалося увійти',
  'auth.error.invalid_init_data':
    'Telegram передав застарілі або недійсні дані запуску. Закрийте та відкрийте застосунок знову.',
  'auth.error.account_inactive': 'Ваш акаунт деактивовано. Зверніться до підтримки.',
  'auth.error.auth_unavailable': 'Вхід тимчасово недоступний. Спробуйте трохи пізніше.',
  'auth.error.network': "Немає з'єднання з сервером. Перевірте інтернет і спробуйте ще раз.",
  'auth.error.timeout': 'Сервер не відповідає. Спробуйте ще раз.',
  'auth.error.server': 'На сервері сталася помилка. Спробуйте ще раз.',
  'auth.error.unexpected': 'Сталася неочікувана помилка. Спробуйте ще раз.',

  'address.title': 'Додати нову адресу',
  'address.description': 'Оберіть область, далі зʼявляться наступні кроки. Пропонуються лише адреси з довідника.',
  'address.area.label': 'Область',
  'address.area.placeholder': 'Введіть область',
  'address.city.label': 'Місто',
  'address.city.placeholder': 'Введіть місто',
  'address.street.label': 'Вулиця',
  'address.street.placeholder': 'Введіть вулицю',
  'address.house.label': 'Будинок',
  'address.house.placeholder': 'Введіть номер будинку',
  'address.apartment.label': 'Квартира',
  'address.apartment.placeholder': 'Введіть номер квартири',
  'address.search.typeToSearch': 'Почніть вводити, щоб побачити варіанти.',
  'address.search.minChars': 'Введіть щонайменше {count} символи.',
  'address.search.loading': 'Шукаємо…',
  'address.search.empty': 'Нічого не знайдено. Спробуйте інший запит.',
  'address.search.more': 'Показано {shown} з {total}. Уточніть запит, щоб звузити список.',
  'address.search.error': 'Не вдалося завантажити варіанти.',
  'address.search.unavailable': 'Довідник адрес тимчасово недоступний. Спробуйте трохи пізніше.',
  'address.areas.loading': 'Завантажуємо області…',
  'address.areas.error': 'Не вдалося завантажити список областей.',
  'address.clear': 'Очистити',
  'address.open': 'Показати варіанти',
  'address.selected.house': 'буд. {number}',
  'address.selected.apartment': 'кв. {number}',
  'address.submit': 'Додати адресу',
  'address.submit.incomplete': 'Оберіть усі частини адреси, щоб її додати.',
  'address.submit.added': 'Адресу додано: {address}',
  'address.submit.duplicate': 'Ця адреса вже є у вашому списку: {address}',
  'address.submit.error.notFound': 'Цієї адреси більше немає в довіднику. Оберіть будинок або квартиру ще раз.',
  'address.submit.error.invalid': 'Сервер не прийняв цю адресу. Оберіть її ще раз.',
  'address.submit.error.network': "Немає з'єднання з сервером. Перевірте інтернет і спробуйте ще раз.",
  'address.submit.error.timeout': 'Сервер не відповідає. Спробуйте ще раз — адресу не буде додано двічі.',
  'address.submit.error.generic': 'Не вдалося додати адресу. Спробуйте ще раз.',

  'addresses.title': 'Мої адреси',
  'addresses.loading': 'Завантажуємо ваші адреси…',
  'addresses.empty.title': 'Ще немає адрес',
  'addresses.empty.description': 'Додайте першу адресу нижче - вона зʼявиться тут.',
  'addresses.error': 'Не вдалося завантажити ваші адреси.',

  'fatal.title': 'Щось пішло не так',
  'fatal.description': 'Застосунок не вдалося запустити. Перезавантажте його.',
  'fatal.config': 'Застосунок неправильно налаштовано.',
} as const;

export type MessageKey = keyof typeof uk;
export type Messages = Readonly<Record<MessageKey, string>>;
