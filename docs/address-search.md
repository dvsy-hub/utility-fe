# Home screen: saved addresses and adding an address

## API contract

Source: `openapi/openapi.json`. On 2026-10-19 its normalized SHA-256 (`309ff64f…`) was identical to the live
`/api/docs-json`. Every endpoint below requires a Bearer token. The live API returned 401 without one; for
`GET /v1/user-addresses` the message was "Bearer token is required".

### Address directory

| Step      | Endpoint             | Required params             | `search` min | Item fields used              |
| --------- | -------------------- | --------------------------- | ------------ | ----------------------------- |
| Area      | `GET /v1/areas`      | (none; `search` optional)   | 1 (optional) | `id`, `name.{uk,en}`          |
| City      | `GET /v1/cities`     | `areaId` (uuid), `search`   | 3            | `id`, `name`                  |
| Street    | `GET /v1/streets`    | `cityId` (uuid), `search`   | 3            | `id`, `name`                  |
| House     | `GET /v1/houses`     | `streetId` (uuid), `search` | 1            | `id`, `name`, `hasApartments` |
| Apartment | `GET /v1/apartments` | `houseId` (uuid), `search`  | 1            | `id`, `name`                  |

- Each list is a page `{ page, size, total, data }`. The default size is 20 and the maximum is 100.
- Cities, streets, houses and apartments are looked up locally first, then through Portmone. Results are stored, so
  every item has a stable local UUID, and that UUID is what the next level expects.
- Errors: 400 for invalid params, 404 when the parent is not found, and 503 when Portmone is unavailable and nothing
  matched locally.
- **Areas:** `/v1/cities` requires `areaId`, so the area is the mandatory first step. The 25 seeded areas fit into one
  page, so the list is loaded once with `size=100` and filtered on the client.

### Multi-apartment houses

`hasApartments` is a **required boolean** on every item of `GET /v1/houses` (`HouseItemDto`), and it is the only
signal the frontend uses.

- When it is `true`, the apartment step is shown, an apartment must be selected, and the apartment is what gets saved.
- When it is `false`, the apartment step isn't rendered, `/v1/apartments` is never called, and the house is saved.

The frontend never infers this from what `/v1/apartments` returns. The save contract (`type: house | apartment`)
matches this model.

What the spec doesn't define, and what would make this fully reliable:

1. A description of `hasApartments`. It isn't documented whether it comes from Portmone or is derived locally, or
   whether it can change for a stored house.
2. Whether `POST /v1/user-addresses` rejects `type: 'house'` for a house with `hasApartments: true`, or
   `type: 'apartment'` for an apartment whose house has `hasApartments: false`. The frontend never sends such
   combinations, but the backend's rule isn't documented.

The backend source isn't available here, so these points are open questions for the backend team, not verified facts.

### Saved addresses: `GET /v1/user-addresses` and `POST /v1/user-addresses`

- **List:** `GET /v1/user-addresses?page&size`. `size` is at most 100, with a default of 20. Each item is:

  ```
  { id, type: 'house' | 'apartment', addressId, label: string | null,
    area, city, street, house: { id, name },
    apartment: { id, name } | null, createdAt, updatedAt }
  ```

  The app requests `size=100` and follows the pages until `total` items have been loaded.

- **Save:** `POST /v1/user-addresses` with the body `CreateUserAddressDto`:

  ```
  { type: 'house' | 'apartment', addressId: uuid, label?: string(1..255) }
  ```

  - `addressId` is the local UUID of the house when `type` is `house`, and of the apartment when `type` is `apartment`.
  - Area, city and street IDs aren't sent. There's no separate apartment field: for a house, the apartment is simply
    not part of the request.
  - `label` is optional and not used.
  - The app sends exactly `{"type":"house","addressId":"<houseId>"}` or
    `{"type":"apartment","addressId":"<apartmentId>"}`.

- **Response:** 200 with the same item shape as the list, so the list is updated from the response without another
  `GET`.
- **Duplicates:** the response is "Saved address, or the existing address if already saved", so the backend
  de-duplicates. The frontend recognises an already listed `id`, doesn't add a second row, and says the address was
  already in the list.
- **Errors:**
  - 400: invalid type, UUID or label.
  - 401: no valid token or session. The shared client refreshes the token once.
  - 404: the house or apartment isn't found or is inactive.
- **Order:** the spec doesn't document the list's order. The app keeps the server order and puts newly added
  addresses first.
- **Names in saved addresses:** unlike the directory items, `name.uk` isn't marked as required here. The parser falls
  back to `en`, then `ru`.

## Behaviour

- **Two sections:** "Мої адреси" (saved addresses) and "Додати нову адресу" (the form).
- **Saved addresses:**
  - States: loading; error with retry; empty ("Ще немає адрес", plus a hint to add the first one below); the list.
  - Each address is shown as `Area, City, Street, буд. N[, кв. M]`, with the apartment part omitted for houses.
  - An address `label`, if the backend has one, is shown above the address.
- **Progressive form:**
  - Only the Area selector is rendered at first. Each next selector is rendered after an entity is selected in the
    previous one; Apartment appears only for `hasApartments: true`.
  - Changing or clearing a step clears every later step and removes their selectors. For example, a new area brings
    the form back to an empty City step.
  - Each child step is keyed by its parent ID, so stale queries and results are discarded.
- **Searchable steps:**
  - Each step's value is a real entity: typed text is only a query and never reveals the next step.
  - Requests are debounced by 300 ms.
  - Nothing is requested below the API's minimum length.
  - A request is aborted when its key changes, and late responses are ignored.
  - The dropdown shows a min-length hint, loading, empty and "Показано N з M" states, and errors with retry. A 503
    shows a "directory temporarily unavailable" message.
- **"Додати адресу":**
  - The button is always visible and disabled until the address is complete: area, city, street and house, plus an
    apartment when the house has apartments.
  - While the request runs, the button shows a spinner and stays focusable but disabled, and all selectors are
    read-only.
  - A ref guard blocks a second submission even before React re-renders.
  - On success, the saved address is prepended to "Мої адреси" from the POST response. The form then resets to the
    Area step only, and a message confirms the address.
  - On failure, the selection is kept and an error is shown:
    - 404: the address is no longer in the directory.
    - 400: the server did not accept the address.
    - Timeout: "Спробуйте ще раз — адресу не буде додано двічі." This is safe because the backend de-duplicates.
    - Network or other errors: a generic message.

    The button stays enabled for a retry.
- **Accessibility and mobile:**
  - Base UI Combobox provides the ARIA pattern and keyboard support (arrows, Enter, Escape).
  - Status messages are live regions.
  - Inputs are 44 px tall and options have 40 px touch targets.

## Code

```
src/components/ui/combobox.tsx            shadcn/ui (base-nova) Combobox (+ input-group.tsx, textarea.tsx)
src/features/address/api.ts               directory endpoints, typed queries, response validation, localizedName
src/features/address/use-address-search.ts  debounced, abortable, stale-safe server search
src/features/address/use-areas.ts         one-time area list load with retry
src/features/address/selection.ts         selection model: set a level → clear deeper levels; completeness
src/features/address/user-addresses.ts    GET/POST /v1/user-addresses, payload builder (toCreateUserAddress), parser
src/features/address/use-saved-addresses.ts  saved list state; merges addresses returned by POST, de-duplicated by id
src/features/address/format.ts            "Area, City, Street, буд. N[, кв. M]"
src/features/address/AddressCombobox.tsx  one searchable step
src/features/address/AddressSearch.tsx    progressive form + "Додати адресу"
src/features/address/SavedAddresses.tsx   saved list with loading / empty / error states
src/features/home/HomeScreen.tsx          greeting, sign-out, both sections
```

## Limitations and open points

- **Not run against live data.** The address endpoints and `/v1/user-addresses` were checked live only for their auth
  requirement (401). Real results, Portmone latency, the de-duplication behaviour and the list order need a signed-in
  session. No address was created on the live backend.
- **`hasApartments` semantics and server-side validation** of the `type`/`addressId` combination are undocumented
  (see above).
- **Duplicate detection while the list is still loading.** If an address is added before the saved list has loaded,
  the frontend can't tell whether it was new and reports it as added. The list itself still de-duplicates by `id`.
- **No list maintenance.** The spec has no delete or rename endpoint for saved addresses, so the list is read-only
  apart from adding.
- **Timeout.** A Portmone lookup can be slow. The shared client timeout (15 s, `DEFAULT_TIMEOUT_MS` in
  `src/config/env.ts`) applies.
- **First page only.** Each search shows its first 20 results, with a hint to refine the query; there's no infinite
  scroll.
