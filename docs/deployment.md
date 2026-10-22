# Deployment and Telegram configuration

The Mini App is a Next.js **standalone** Node server (`node server.js`, port 3000). Requirements:

- **HTTPS** with a valid certificate on a **public URL** — Telegram only opens Mini Apps over HTTPS. TLS is terminated by
  the platform's reverse proxy.
- **No `X-Frame-Options` / `frame-ancestors 'none'`** — Telegram Web embeds Mini Apps in an iframe. The app's own CSP
  deliberately omits `frame-ancestors`.
- The backend must be configured for **the same bot** that launches the Mini App (initData is signed per bot).

## 1. Environment variables (runtime)

Read per request by the server — change them without rebuilding the image.

| Variable           | Required | Notes                                                                                |
| ------------------ | -------- | ------------------------------------------------------------------------------------ |
| `API_BASE_URL`     | yes      | Backend root, e.g. `https://dvsy-utility-backend-…sslip.io`. https only outside dev. |
| `TELEGRAM_BOT_URL` | no       | `https://t.me/<bot>/<app>`; shown on the "open in Telegram" screen.                  |
| `DEV_INIT_DATA`    | no       | Honoured only with `NODE_ENV=development` (`pnpm dev`).                              |
| `PORT`, `HOSTNAME` | no       | Set in the Dockerfile to `3000` / `0.0.0.0`.                                         |

All values reach the browser. The bot token lives only on the backend. If `API_BASE_URL` is missing or invalid the page
shows "Застосунок неправильно налаштовано" and the server logs the reason.

## 2. Recommended: container next to the backend

The backend runs on a self-hosted PaaS behind an `sslip.io` domain (Dokploy/Coolify-style, inferred from the URL).
Deploy the frontend as a second application on the same platform:

1. Create an application from this repository, build type **Dockerfile** (no build arguments needed).
2. Set the environment variable `API_BASE_URL=https://dvsy-utility-backend-rk9l58-56f94b-13-140-149-47.sslip.io`
   (and optionally `TELEGRAM_BOT_URL`).
3. Container port **3000**. Health check: `GET /api/health` → `{"status":"ok"}`.
4. Attach a domain with HTTPS (the platform's generated domain with Let's Encrypt, or your own).
5. Deploy and open `https://<frontend-domain>/` in a browser: you should see "Відкрийте застосунок у Telegram", and the
   response should carry a `Content-Security-Policy` header with a nonce.

Local equivalent:

```bash
docker build -t utilityhub-miniapp .
docker run --rm -p 3000:3000 -e API_BASE_URL=https://<backend> utilityhub-miniapp   # http://localhost:3000
```

Without Docker: `pnpm build && API_BASE_URL=https://<backend> pnpm start`.

### Preview environments

Platforms with PR previews (Dokploy, Coolify, Railway, Render, Fly.io…) can run the same image per branch. Because
Telegram binds one Mini App URL per bot and the backend validates initData against one bot, use a **separate staging
bot** (and backend configuration) for previews rather than repointing the production bot.

| Environment | Frontend URL                      | Bot              | Backend                     |
| ----------- | --------------------------------- | ---------------- | --------------------------- |
| Local       | tunnel to `pnpm dev` (see README) | personal dev bot | shared dev backend or local |
| Preview     | platform preview URL              | staging bot      | staging backend             |
| Production  | production domain                 | production bot   | production backend          |

## 3. Telegram configuration (@BotFather)

1. Use the bot whose token is configured on the backend (ask the backend owner which one).
2. `/mybots` → bot → **Bot Settings → Configure Mini App → Enable Mini App** → set the URL to `https://<frontend-domain>/`.
   Create a direct link `https://t.me/<bot_username>/<short_name>` via `/newapp` if needed.
3. Optional: **Menu Button** → same URL.
4. Set `TELEGRAM_BOT_URL` to the direct link and restart the container.

## 4. Verify end to end

1. Open the deployed URL in a regular browser → "open in Telegram" screen, no API calls in the network tab.
2. Open the Mini App from the bot in Telegram → loading screen → "Вітаємо, …!" with the backend user id.
3. Reload the Mini App (⋮ → Reload) → the session is reused (`/v1/auth/me`, possibly `/v1/auth/refresh`), no new
   `/v1/auth/telegram` call.
4. Tap **Вийти** → `POST /v1/auth/logout` → "Ви вийшли" → **Увійти знову** → new login.
5. Debugging inside Telegram: iOS — enable "Allow Web View Inspection" and use Safari's Develop menu; Android — enable
   WebView debug and use `chrome://inspect`; Desktop/macOS beta — enable webview inspection / "Debug Mini Apps".

If step 2 shows "Telegram передав застарілі або недійсні дані запуску", the backend rejected initData — most likely the
Mini App was opened from a different bot than the one configured on the backend. CSP violations (if any) appear in the
WebView console as `Refused to …`.

## 5. CI

`.github/workflows/ci.yml` (pushes to `main`, pull requests):

1. `pnpm install --frozen-lockfile` (pnpm version from `packageManager`, Node from `.nvmrc`)
2. `pnpm audit --audit-level=moderate`
3. typecheck (TS 7) → lint → format check → tests → production build (artifact: standalone server)
4. Docker image build + smoke test (`/api/health`, CSP header present)

Deployment itself is left to the platform's Git integration (auto-deploy on `main`, previews on PRs), so no platform
credentials are stored in GitHub.
