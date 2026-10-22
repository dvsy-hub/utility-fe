# UtilityHub — Telegram Mini App

Frontend foundation for the UtilityHub Mini App: Next.js 16 (App Router, standalone server), Telegram SDK integration,
real `initData` authentication against the UtilityHub backend, a typed API client, and the tooling to build features on
top. After sign-in the home screen lists the user's saved addresses and adds new ones through a progressive address
search (Area → City → Street → House → Apartment, the apartment only for multi-apartment houses).

- Architecture and decisions: [docs/architecture.md](docs/architecture.md)
- Auth contract, verified facts, open questions: [docs/auth.md](docs/auth.md)
- Saved addresses and address search (API contract, behaviour, limitations): [docs/address-search.md](docs/address-search.md)
- Deployment and BotFather setup: [docs/deployment.md](docs/deployment.md)

**Stack:** Node 24 LTS · pnpm 12 · TypeScript 7 (`tsc`) · Next.js 16.4 · React 19.3 · Tailwind CSS 4.3 · shadcn/ui (Base UI) ·
react-hook-form 7.90 + zod 4.6 · ESLint 10 · Vitest 5 · Prettier 3.9

## Quick start

```bash
corepack enable            # or: npm i -g pnpm@12.14.0 — the version is pinned in package.json "packageManager"
pnpm install               # also generates src/shared/api/schema.d.ts from openapi/openapi.json
cp .env.example .env.local # API_BASE_URL already points to the dev backend
pnpm dev                   # http://localhost:3000
```

Switching from an earlier npm checkout? Delete `node_modules` and `package-lock.json` first, then commit the new
`pnpm-lock.yaml`.

Opened in a normal browser, the app shows "Відкрийте застосунок у Telegram" — expected: authentication needs real
`initData`, which only Telegram provides.

## Running inside Telegram (local development)

Telegram needs a public HTTPS URL. Use a tunnel to the dev server:

```bash
pnpm dev
cloudflared tunnel --url http://localhost:3000    # or: ngrok http 3000
```

In @BotFather set the Mini App URL of **your dev bot** to the tunnel URL (see
[deployment.md](docs/deployment.md#3-telegram-configuration-botfather)). The backend must validate initData for that same
bot, otherwise you'll get the "invalid launch data" error. Tunnel hosts allowed for dev HMR are listed in
`next.config.ts` (`allowedDevOrigins`).

**Browser shortcut (dev only):** copy `Telegram.WebApp.initData` from a live Mini App session (WebView inspector console)
into `DEV_INIT_DATA` in `.env.local`. It is used only with `NODE_ENV=development` when the app is opened outside Telegram,
and the backend still verifies it (and rejects it once older than its `auth_date` window). Never commit it — it contains
your Telegram profile and a valid signature — and don't expose `pnpm dev` through a public tunnel while it is set.

## Scripts

| Command              | What it does                                                                      |
| -------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`           | Next.js dev server (Turbopack)                                                    |
| `pnpm build`         | Type-check with TS 7, `next build`, prepare `.next/standalone`                    |
| `pnpm start`         | Run the standalone server (`API_BASE_URL=… pnpm start`)                           |
| `pnpm check`         | typecheck + lint + format check + tests (CI also runs audit, build and Docker)    |
| `pnpm typecheck`     | `next typegen && tsc --noEmit` (TypeScript 7)                                     |
| `pnpm lint`          | ESLint 10: eslint-config-next + typescript-eslint strict-type-checked, 0 warnings |
| `pnpm format`        | Prettier write                                                                    |
| `pnpm test`          | Vitest (jsdom)                                                                    |
| `pnpm api:fetch`     | Download the backend OpenAPI spec to `openapi/openapi.json`                       |
| `pnpm ui:add <name>` | Add a shadcn/ui component (e.g. `pnpm ui:add dialog`)                             |
| `pnpm api:generate`  | Regenerate `src/shared/api/schema.d.ts` from the spec                             |

## Environment

See [`.env.example`](.env.example). Variables are read **at runtime** by the server (one build/image for all
environments) and passed to the browser, so they must not contain secrets.

| Variable           | Required | Description                                  |
| ------------------ | -------- | -------------------------------------------- |
| `API_BASE_URL`     | yes      | Backend root URL (endpoints are under `/v1`) |
| `TELEGRAM_BOT_URL` | no       | Link shown when opened outside Telegram      |
| `DEV_INIT_DATA`    | no       | Dev-only real initData for browser testing   |

## Project structure

```
src/
  proxy.ts        per-request CSP nonce
  app/            Next.js routes: layout (Telegram SDK), page, error, global-error, api/health
  app-shell/      client-only Mini App root, services wiring, auth gate
  config/         env parsing, runtime config, CSP builder
  telegram/       official SDK typings + launch context
  shared/api/     HTTP client, envelope, errors, generated OpenAPI types
  features/auth/  auth API, TokenManager, session store, AuthController, screens
  features/address/ directory + user-address APIs, search hooks, progressive form, saved list
  features/home/  home screen (greeting, sign-out, saved addresses, add address)
  i18n/           uk (default) / en dictionaries, translator
  components/ui/  shadcn/ui components (add more: pnpm ui:add <name>)
  components/     Screen, StatusView, ActionButton
  shared/forms/   form infrastructure (zod locale, RHF + zod + Field pattern)
  lib/utils.ts    cn()
openapi/          committed snapshot of the backend OpenAPI spec
docs/             architecture, auth, deployment
```

## Using the API client in a feature

```tsx
'use client';
import { useApiClient, type paths } from '@/shared/api';

type AddressesPage = paths['/v1/user-addresses']['get']['responses'][200]['content']['application/json']['data'];

function useLoadAddresses() {
  const api = useApiClient(); // Bearer token + refresh-on-401 included
  return () => api.get<AddressesPage>('/v1/user-addresses', { query: { page: 1, size: 20 } });
}
```

Errors are typed: `ApiError` (backend envelope, `status`/`code`/`details`), `NetworkError`, `TimeoutError`,
`InvalidResponseError`.

## Verification status

Checked in the authoring sandbox against your installed `node_modules` (real libraries; no registry access there):

| Item                                                                         | Result                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Backend auth contract (spec + live probes); auth client against the live API | ✅ verified ([docs/auth.md](docs/auth.md))                                                          |
| Address and user-address endpoints require a Bearer token (live probe)       | ✅ 401 without a token; result data not checked (needs a session)                                   |
| Type check, TypeScript 7.0.2 (strict)                                        | ✅ `tsc --noEmit`, 0 errors                                                                         |
| ESLint 10 + eslint-config-next 16.4 + typescript-eslint 8.71 strict          | ✅ 0 errors, 0 warnings                                                                             |
| Prettier (+ Tailwind class sorting)                                          | ✅ all files formatted                                                                              |
| Tests: 146 in 18 files                                                       | ✅ real Vitest 5 `expect`/`vi`, jsdom 30, React 19.3, Base UI 1.9 (custom runner, not `vitest run`) |
| Tailwind compile of `globals.css` incl. the new combobox classes             | ✅                                                                                                  |
| `pnpm test` (Vitest runner), `next build`, Docker, real login in Telegram    | ⏳ first run on your machine                                                                        |

After pulling this change:

```bash
pnpm install       # adds Tailwind, shadcn/ui, Base UI, react-hook-form, zod…
pnpm format        # lets prettier-plugin-tailwindcss sort the Tailwind classes once
pnpm check && pnpm build
git add pnpm-lock.yaml   # CI and Docker install with --frozen-lockfile
```
