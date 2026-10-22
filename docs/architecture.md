# Architecture

Scope of this phase: frontend foundation + Telegram authentication. No business features.

## Stack

| Concern         | Choice                                                                                                           | Why                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Framework       | Next.js 16 (App Router), React 19, `output: 'standalone'`                                                        | Node server enables per-request CSP nonces, runtime config (one image for all environments), route handlers / BFF later. |
| Language        | TypeScript 7 (native Go compiler, `tsc`) for type checking                                                       | Fast, current; strict flags incl. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.                              |
| Package manager | pnpm 12 (`packageManager` field, `pnpm-workspace.yaml` settings)                                                 | Strict dependency graph, reviewed install scripts (`allowBuilds`), frozen lockfile in CI/Docker.                         |
| Telegram SDK    | Official `telegram-web-app.js` via `next/script` `beforeInteractive` + typed wrapper                             | The SDK Telegram documents; the wrapper (`src/telegram`) types only what we use.                                         |
| API types       | `openapi-typescript` from the committed spec (`openapi/openapi.json`)                                            | Request DTOs come from the real contract; regenerated on install.                                                        |
| HTTP            | Own `fetch` client (~180 lines)                                                                                  | Envelope unwrapping, typed errors, timeout incl. body, single 401→refresh→retry; no runtime dependency.                  |
| State           | `useSyncExternalStore` over framework-agnostic controllers                                                       | Auth is the only global state; a state library would be premature.                                                       |
| Styling         | Tailwind CSS 4.3 (CSS-first config in `src/app/globals.css`, PostCSS plugin)                                     | Utility-first, zero runtime; class order enforced by `prettier-plugin-tailwindcss`.                                      |
| UI components   | shadcn/ui 4 (`base-nova` style on Base UI, `components.json`), lucide icons                                      | Owned, editable component code; `pnpm ui:add <name>` adds more from the registry.                                        |
| Theming         | shadcn tokens mapped onto Telegram's `--tg-theme-*` + `.dark` from `WebApp.colorScheme`                          | Every component follows the user's exact Telegram palette and switches live on `themeChanged`.                           |
| Forms           | react-hook-form 7.90 + zod 4.6 + `@hookform/resolvers` 5, shadcn `Field`                                         | The pattern shadcn documents; zod messages localized with the app locale.                                                |
| i18n            | Typed dictionaries (`uk` default, `en`)                                                                          | Keys checked by the compiler; no library needed for the current string volume.                                           |
| Lint / format   | ESLint 10 + `eslint-config-next` (core-web-vitals, typescript) + typescript-eslint strict-type-checked; Prettier | Official Next.js setup plus strict type-aware rules.                                                                     |
| Tests           | Vitest 5 + Testing Library + jsdom                                                                               | Next.js-recommended setup for unit/component tests.                                                                      |
| Delivery        | Docker (standalone Node server) on the backend's PaaS; GitHub Actions CI                                         | See [deployment.md](deployment.md).                                                                                      |

Deliberately **not** added yet: router-level data fetching, TanStack Query, a state manager, Sentry, `next-themes` (the theme is owned by Telegram, see below).

## TypeScript 7 and tools that still need the TS 6 API

TypeScript 7.0 ships no JavaScript compiler API yet ("We expect TypeScript 7.1 to ship with a new (and different) API").
typescript-eslint (`typescript >=4.8.4 <6.1.0`) and openapi-typescript (`typescript ^5.x`) import `typescript` directly.
Following the official recommendation from the [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/):

```json
"@typescript/native": "npm:typescript@^7.0.2",          // provides the `tsc` binary → TypeScript 7
"typescript": "npm:@typescript/typescript6@^6.0.2"      // provides the TS 6.0 API under the name `typescript` (bin: tsc6)
```

- `pnpm typecheck` = `next typegen && tsc --noEmit` → TypeScript 7.
- `next build` skips its own checker (`typescript.ignoreBuildErrors`) because `pnpm build` already ran `pnpm typecheck`
  with TS 7; Next's checker would otherwise resolve the `typescript` package (the TS 6 API shim).
- `pnpm-workspace.yaml` widens openapi-typescript's `typescript` peer to 6 (`peerDependencyRules`), which is what it
  uses at generation time.
- When typescript-eslint and openapi-typescript support TS 7 natively, drop the alias and set `typescript` to `^7`.

## Rendering model

Telegram delivers `initData`, theme and viewport only inside the client WebView, so authentication is client-side by
nature. The server's job is limited to:

1. `src/proxy.ts` — per-request nonce + CSP header.
2. `src/app/layout.tsx` — `<html>`, the Telegram SDK `<Script strategy="beforeInteractive" nonce>`, server-side locale guess.
3. `src/app/page.tsx` — reads runtime config (`API_BASE_URL`, …) per request and renders `<MiniApp config>`.
4. `src/app-shell/MiniApp.tsx` — `next/dynamic(..., { ssr: false })`: the server sends the loading screen; the client
   app (which touches `window.Telegram`) runs only in the browser.

## Module boundaries

```
src/
├─ proxy.ts              CSP nonce per request
├─ app/                  Next.js routes: layout, page, error, global-error, api/health, icon
├─ app-shell/            Client composition root
│  ├─ MiniApp.tsx        client-only boundary (next/dynamic, ssr: false)
│  ├─ ClientApp.tsx      creates services, prepares Telegram container, providers
│  ├─ services.ts        wires telegram → auth → api (the ONLY place modules are connected)
│  ├─ AuthGate.tsx       renders a screen per auth state
│  └─ FatalScreen.tsx
├─ config/               env parsing, runtime (per-request) config, CSP builder
├─ telegram/             SDK constants, typings, launch context (no React, no API knowledge)
├─ shared/api/           HTTP client, envelope, typed errors, generated OpenAPI types (no auth knowledge)
├─ features/auth/        Auth API, TokenManager, session store, AuthController, React bindings, screens
├─ features/address/     Address directory API, search hooks, cascading comboboxes (docs/address-search.md)
├─ features/home/        Home screen rendered by AuthGate for authenticated users
├─ shared/forms/         Form infrastructure (validation-message locale; RHF + zod pattern in forms.test.tsx)
├─ i18n/                 Locales, translator, provider
├─ components/ui/        shadcn/ui components (generated, kept close to upstream)
├─ components/           App-level building blocks: Screen, StatusView, ActionButton
├─ lib/utils.ts          `cn` (shadcn convention)
└─ test/                 Test setup and envelope helpers
```

Dependency rules:

- `telegram` and `shared/api` depend on nothing in the app; `shared/api` knows only the `AccessTokenProvider` interface,
  which `features/auth` implements.
- `features/*` may use `shared/*`, `telegram`, `i18n`, `components`; features never import each other's internals.
- Only `app-shell/services.ts` wires concrete instances together; only `app/` and `proxy.ts` touch Next.js server APIs.
- Modules that create React context are marked `'use client'`; pure modules (translator, config, controllers) are
  usable on both sides.

## UI, theming and forms

**Tailwind + shadcn/ui.** `src/app/globals.css` holds the Tailwind 4 setup (`@import 'tailwindcss'`, `tw-animate-css`,
`shadcn/tailwind.css`), the shadcn `@theme inline` token mapping and a `tg-screen` utility (safe areas + stable viewport
height). Components live in `src/components/ui` and are added with `pnpm ui:add <name>` (shadcn CLI, `components.json`:
style `base-nova`, Base UI primitives, lucide icons).

**Telegram theme.** Two layers, both driven by Telegram:

1. **Colors.** Every shadcn token is `var(--tg-theme-…, <shadcn neutral fallback>)`, e.g.
   `--primary: var(--tg-theme-button-color, …)`, `--muted-foreground: var(--tg-theme-hint-color, …)`. telegram-web-app.js
   maintains the `--tg-theme-*` variables (and updates them on theme change), so components always use the user's exact
   palette. Fallbacks apply outside Telegram.
2. **Light/dark mode.** `src/telegram/theme.ts` sets `.dark` (and `color-scheme`) on `<html>` from
   `Telegram.WebApp.colorScheme`, re-applies it on `themeChanged`, and falls back to `prefers-color-scheme` outside
   Telegram. This drives Tailwind's `dark:` variant and the dark fallbacks. It runs before `WebApp.ready()`, i.e. while
   Telegram still shows its placeholder, so users don't see a flash of the wrong theme.

| shadcn token                   | Telegram variable                    |
| ------------------------------ | ------------------------------------ |
| `background` / `foreground`    | `bg_color` / `text_color`            |
| `card`                         | `section_bg_color`                   |
| `primary` / `-foreground`      | `button_color` / `button_text_color` |
| `secondary`, `muted`, `accent` | `secondary_bg_color`                 |
| `muted-foreground`             | `hint_color`                         |
| `accent-foreground`            | `accent_text_color`                  |
| `destructive`                  | `destructive_text_color`             |
| `border`, `input`              | `section_separator_color`            |
| `ring`                         | `button_color`                       |
| `link` (custom)                | `link_color`                         |

**Forms.** Use shadcn's `Field` components with react-hook-form's `Controller` and `zodResolver` (the reference
implementation is `src/shared/forms/forms.test.tsx`):

```tsx
const schema = z.object({ label: z.string().trim().min(2) });
const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { label: '' } });

<Controller
  name="label"
  control={form.control}
  render={({ field, fieldState }) => (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor="label">{t('…')}</FieldLabel>
      <Input {...field} id="label" aria-invalid={fieldState.invalid} />
      {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  )}
/>;
```

zod's built-in messages follow the app locale (`configureValidationLocale`, called by `ClientApp`). Prefer i18n keys
(`t('…')`) for custom messages. Map backend 400 `details` onto fields with `form.setError` when a feature needs it.

## Key decisions

1. **Raw initData → backend, nothing else.** The backend verifies the signature; the client never validates it nor
   trusts `initDataUnsafe`.
2. **Authenticated = backend accepted the session on `/v1/auth/me`.** Not "Telegram gave us a user".
3. **Two HTTP clients.** A public one for auth endpoints (credentials in the body) and an authenticated one for
   everything else — refresh loops are impossible by construction.
4. **Single-flight refresh** (the backend rotates refresh tokens) and **generation guards**: a login or refresh that
   finishes after sign-out is discarded and its tokens revoked.
5. **Reactive refresh** (on 401) instead of timers — robust against device clock skew.
6. **sessionStorage, not localStorage.** Tokens survive reloads within one Mini App session, not app restarts (fresh
   initData is available then anyway). See [auth.md](auth.md#reloads-and-repeated-initialization).
7. **Runtime config, not build-time.** `API_BASE_URL` is read per request on the server, so one Docker image runs in
   every environment.
8. **Nonce-based CSP** without `frame-ancestors` (Telegram Web embeds Mini Apps in an iframe).

## Extending

- **New endpoint:** `pnpm api:fetch && pnpm api:generate`, then add a typed function in the feature's `api.ts` using
  `useApiClient()` (`client.get(path, { parse })`). Validate response shapes the feature depends on.
- **New screens/routes:** keep them client components under the `authenticated` branch of `AuthGate`, or add App Router
  segments rendered inside the client shell. Telegram `BackButton` integration belongs in `src/telegram`.
- **Server state:** add TanStack Query when lists appear; call the existing `HttpClient` in query functions.
- **BFF / server-side calls:** add route handlers under `src/app/api/*` (already excluded from the CSP proxy matcher).
- **New strings:** add the key to `src/i18n/locales/uk.ts`; the compiler then requires it in `en.ts`.
- **Error reporting:** hook into `app/error.tsx`, `app/global-error.tsx` and `AuthFailure.debugMessage`.
