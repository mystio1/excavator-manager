# Excavator Manager

A fast, mobile-friendly management system for excavator/JCB owners — machines, customers, operators, work-hour tracking, salaries, servicing and billing. Built with Next.js (App Router), Prisma + Postgres, and Auth.js. Also ships as a directly-installed Android app (Capacitor) with in-app self-updates — see [Android app](#android-app) below.

## Running it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first visit redirects to **Register**, which creates your business and its first login in one step. Each business's data is fully isolated — you can register more than one business on the same install if needed.

## Data

Postgres, via `DATABASE_URL` in `.env` (not committed). `SHADOW_DATABASE_URL` is only needed for `prisma migrate dev` locally. `AUTH_SECRET` is the Auth.js session-encryption key — generate a new one for any new deployment with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Self-hosting in production

Deployed on [Render](https://render.com) — pushing to `main` redeploys automatically. Render env vars needed: `DATABASE_URL` (Internal Postgres connection string), `AUTH_SECRET`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` (forgot-password emails), `GITHUB_RELEASE_REPO` and optionally `GITHUB_API_TOKEN` (used by `/api/app-version`, see below). Pre-Deploy Command: `npx prisma migrate deploy`.

## Android app

The Android app (`/android`, Capacitor) is a native shell that loads this same deployed site directly — there's no separate mobile codebase to keep in sync. Ordinary feature changes need nothing beyond the usual `git push`; only native-shell changes (permissions, icon, the update system itself) need a new APK build.

**Cutting a new Android release:**

```bash
git tag -a v1.0.3 -m "Dashboard improvements" -m "Bug fixes"
git push origin v1.0.3
```

Each `-m` line becomes a release-notes bullet shown in the in-app update dialog. Add a line containing exactly `[force-update]` to make it mandatory. `.github/workflows/release-android.yml` then builds and signs the APK and publishes it as a GitHub Release; installed apps discover it via `GET /api/app-version`, which reads that release's `version.json`.

Required GitHub Secrets (Settings → Secrets and variables → Actions) for the signing key: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## What's built so far

- Auth + multi-business accounts, forgot-password email flow
- Dashboard with live counts, alerts, predictive per-component maintenance warnings, and trend charts
- Excavators: machines, work sessions, daily hour logging, service/component history, site tracking
- Customers, Operators (with a self-serve portal — PIN login, Hindi/Marathi/English), GST/Non-GST billing with PDF/Excel export
- Android app with in-app auto-update (this file's [Android app](#android-app) section)
