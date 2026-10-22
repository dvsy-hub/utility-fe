# Telegram authentication

How the Mini App authenticates against the UtilityHub backend, what is verified, and what is still open.

Sources of truth: the backend OpenAPI spec (snapshot in [`openapi/openapi.json`](../openapi/openapi.json), byte-identical to
`GET /api/docs-json` on 2026-10-19) and live probes against
`https://dvsy-utility-backend-rk9l58-56f94b-13-140-149-47.sslip.io`. There is no backend source code in this workspace.

## 1. Backend contract

Base URL is the host root. Endpoints are versioned under `/v1` (**not** `/api/v1`; `/api` serves only the Swagger UI).

| Endpoint                 | Auth           | Body               | Success `data`                                                               |
| ------------------------ | -------------- | ------------------ | ---------------------------------------------------------------------------- |
| `POST /v1/auth/telegram` | none           | `{ initData }`     | `{ accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt }` |
| `POST /v1/auth/refresh`  | none           | `{ refreshToken }` | same token pair (rotated: "Rotate access and refresh tokens")                |
| `POST /v1/auth/logout`   | none           | `{ refreshToken }` | `{ revoked: true }`                                                          |
| `GET /v1/auth/me`        | `Bearer` (JWT) | —                  | `{ id (uuid), firstName?, lastName?, createdAt, updatedAt }`                 |

- `initData` is described as "Raw `Telegram.WebApp.initData` string", validated as a non-empty string of at most 8192 chars.
- Security scheme: HTTP `bearer`, `bearerFormat: JWT`. Subsequent requests send `Authorization: Bearer <accessToken>`.
- Every response uses one envelope:

  ```json
  { "result": true,  "error": { "message": "", "code": 0 }, "data": { } }
  { "result": false, "error": { "message": "Invalid Telegram init data", "code": 401, "details": null }, "data": null }
  ```

  `error.code` mirrors the HTTP status; `details` holds validation messages (array or string) for 400s.

### Documented error responses

| Endpoint                              | Status  | Meaning (from spec)                             |
| ------------------------------------- | ------- | ----------------------------------------------- |
| `/auth/telegram`                      | 400     | Invalid request body                            |
|                                       | 401     | Invalid or expired Telegram data                |
|                                       | 403     | Telegram account or user is inactive            |
|                                       | 503     | Telegram authentication is not configured       |
| `/auth/refresh`                       | 400/401 | Invalid body / invalid or expired refresh token |
| `/auth/logout`                        | 400/401 | Invalid body / invalid session                  |
| `/auth/me` and other protected routes | 401     | Invalid or expired access token                 |

## 2. Verified vs. assumed

### Verified on the live API (2026-10-19)

| Probe                                                                                      | Result                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/auth/telegram {}`                                                                | 400, details: `initData must be shorter than or equal to 8192 characters`, `initData should not be empty`, `initData must be a string` |
| `POST /v1/auth/telegram {"initData":""}`                                                   | 400, `initData should not be empty`                                                                                                    |
| `POST /v1/auth/telegram` with garbage / forged initData                                    | 401 `Invalid Telegram init data` (signature is checked server-side)                                                                    |
| Extra unknown body fields                                                                  | ignored (still 401 for forged data, not 400)                                                                                           |
| `POST /v1/auth/refresh {"refreshToken":"bogus"}`                                           | 401 `Invalid or expired token`                                                                                                         |
| `POST /v1/auth/refresh {}`                                                                 | 400 with validation details                                                                                                            |
| `POST /v1/auth/logout {"refreshToken":"bogus"}`                                            | 401 `Invalid or expired token`                                                                                                         |
| `GET /v1/auth/me` without header                                                           | 401 `Bearer token is required`                                                                                                         |
| `GET /v1/auth/me` with an invalid Bearer                                                   | 401 `Invalid or expired token`                                                                                                         |
| `GET /v1/user-addresses` without header                                                    | 401 `Bearer token is required` (same guard for all protected routes)                                                                   |
| Unknown route                                                                              | 404 in the same envelope                                                                                                               |
| CORS from a foreign origin (`https://example.com`), JSON POST and GET with `Authorization` | allowed; `Access-Control-Allow-Origin: *`                                                                                              |

The app's own compiled `shared/api` + `features/auth` code was also run in a browser on a foreign origin against the live
API. It produced the expected typed errors for each case above, and `AuthController` went `authenticating → error
(invalid_init_data)` for a forged initData.

The fact that forged initData yields 401 rather than 503 suggests Telegram auth is configured on this deployment
(likely, not proven — the backend might parse before checking configuration).

### Not verifiable from here

- **The success path** (`200` with tokens) requires real initData signed for the bot configured on the backend.
  It must be tested by opening the Mini App from that bot in Telegram (see [deployment.md](deployment.md#4-verify-end-to-end)).
- **Which validation the backend uses**: HMAC-SHA-256 with the bot token (`secret = HMAC("WebAppData", bot_token)`)
  or the Ed25519 `signature` field for third parties. Either way it is bound to one bot, so the Mini App must be
  launched from the bot whose token/id the backend uses.
- **Maximum `auth_date` age** accepted by the backend ("expired Telegram data" implies there is one).
- **Token lifetimes** — visible only in a real response (`*ExpiresAt`).
- **Refresh-token reuse policy** — whether reusing an already-rotated refresh token revokes the session family.
- **403 / 503 responses** — documented, not observed.

### Spec gaps the client compensates for

- Success schemas for the auth endpoints do not mark any field as `required`, so `accessToken`/`refreshToken` are
  validated at runtime (`parseTokenPair`) and `id` for `/me` (`parseCurrentUser`). A response without them is treated as
  an invalid response, never as a session.

## 3. Client flow

```
Request → proxy.ts (CSP nonce) → app/layout.tsx (Telegram SDK <Script beforeInteractive>)
       → app/page.tsx (runtime config) → <MiniApp> (server renders the loading screen)
Browser: <ClientApp> (client-only, after hydration)
 ├─ window.Telegram.WebApp is ready (SDK ran before hydration)
 ├─ prepareTelegramShell(): ready(), expand(), disableVerticalSwipes() (7.7+)
 └─ AuthController.start()   (idempotent / single-flight)
      ├─ no initData ─────────────────────────────▶ state: unsupported ("Open in Telegram")
      ├─ state: authenticating
      ├─ session in sessionStorage for this tg user?
      │    └─ yes → GET /v1/auth/me (401 → POST /refresh → retry once)
      │          ├─ 200 ─────────────────────────▶ state: authenticated
      │          ├─ 401 → discard session, continue below
      │          └─ network/5xx ─────────────────▶ state: error (retryable)
      ├─ POST /v1/auth/telegram { initData: Telegram.WebApp.initData }
      │    └─ error ─────────────────────────────▶ state: error (classified)
      └─ GET /v1/auth/me
           ├─ 200 ───────────────────────────────▶ state: authenticated
           └─ error ─────────────────────────────▶ state: error
```

Authenticated requests (`apiClient` / `useApiClient()`):

1. Send `Authorization: Bearer <accessToken>`.
2. On `401`, call `POST /v1/auth/refresh` once (shared by concurrent requests — tokens rotate), then retry the original
   request once with the new token.
3. If refresh returns 400/401, the session is cleared and `AuthController` silently re-authenticates with the current
   initData. If that fails, the error screen is shown.
4. Network errors and 5xx on refresh keep the session (transient) and surface to the caller.

Reactive refresh (on 401) is used instead of a timer based on `accessTokenExpiresAt`, because WebView clocks can be
skewed; the expiry fields are stored for diagnostics only.

### Error mapping (UI)

| Failure             | Cause                                        | User action                                                   |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `invalid_init_data` | 400/401 on `/auth/telegram`                  | Close & reopen app (no retry: same initData would fail again) |
| `account_inactive`  | 403                                          | Contact support                                               |
| `auth_unavailable`  | 503                                          | Retry                                                         |
| `server`            | other 5xx                                    | Retry                                                         |
| `network`/`timeout` | no response / >15 s                          | Retry                                                         |
| `unexpected`        | malformed response, 401 on `/me` after login | Retry                                                         |

### Reloads and repeated initialization

- `AuthController.start()` is single-flight and a no-op once authenticated, so React StrictMode, HMR and double mounts
  never trigger duplicate logins.
- Tokens are kept in memory and mirrored to **sessionStorage** (cleared when the Mini App WebView closes). A reload
  reuses the session (refreshing if needed) instead of re-sending possibly stale initData. A brand-new launch always
  gets fresh initData from Telegram and, if no session exists, exchanges it.
- The stored session is keyed by the (unverified) Telegram user id only to avoid reusing one account's tokens for another
  account in the same browser context; the backend validates every restored session before the UI shows it.

## 4. Security rules enforced in code

- Only `Telegram.WebApp.initData` (the raw signed string) is sent; `initDataUnsafe` is used solely for UI hints
  (language) and the cache key.
- No client-side signature validation, no bot token, no secrets anywhere in the frontend (the runtime config passed to
  the browser contains only public values: API URL, bot link).
- A user counts as authenticated only after the backend accepted the session on `GET /v1/auth/me`.
- No mock users or tokens in production code. The dev-only `DEV_INIT_DATA` override is honoured only when
  `NODE_ENV=development` and still goes through backend verification.
- API calls use `credentials: 'omit'`. A per-request, nonce-based CSP (`src/proxy.ts`) allows only nonced scripts
  (Next.js + the Telegram SDK) and restricts `connect-src` to the configured API origin.

## 5. Backend: required and recommended changes

**Required: none.** The existing API supports the full Mini App flow (initData exchange, Bearer access, rotation, logout).

Recommended, small and optional:

1. **CORS allowlist** — replace `Access-Control-Allow-Origin: *` with the Mini App origin(s) in production.
2. **Mark response fields `required`** in the auth success schemas (as other endpoints already do) so generated types are exact.
3. **Document the accepted `auth_date` window and token TTLs** in the spec descriptions.
4. Optionally return Telegram profile fields (`username`, `photoUrl`, `languageCode`) from `/v1/auth/me` if the UI needs
   them — the client must not take them from `initDataUnsafe` for anything security-relevant.
