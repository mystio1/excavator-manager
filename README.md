# Excavator Manager

A fast, mobile-friendly management system for excavator/JCB owners — machines, customers, operators, work-hour tracking, salaries, servicing and billing. Built with Next.js (App Router), Prisma + Postgres, and Auth.js. Also ships as a directly-installed Android app (Capacitor) with in-app self-updates — see [Android app](#android-app) below.

## Quick start

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL, AUTH_SECRET, APP_URL …
npx prisma migrate deploy # apply migrations to your (non-production) database
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first visit redirects to **Register**, which creates your business and its first login in one step. Each business's data is fully isolated — you can register more than one business on the same install if needed.

The application's environment variables are listed in [`.env.example`](.env.example) (names and placeholders only — never commit real values). The complete register — including tooling-only variables such as `DRILL_DATABASE_URL`, `PRISMA_MIGRATIONS_PATH` and `BUILD_TARGET`, what validates each one and how to rotate it — is [docs/configuration.md](docs/configuration.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run lint` | ESLint (also blocks runtime imports of server-only modules in UI code) |
| `npm run typecheck` | `tsc --noEmit` (run `npx next typegen` once after a fresh checkout) |
| `npm test` | Vitest suite. DB-backed tests create and delete throwaway businesses — point `TEST_DATABASE_URL` (or `DATABASE_URL`) at a **non-production** database |
| `npm run test:migrations` | Applies every migration to scratch schemas: fresh DB, upgrade with representative data, abort guard |
| `npm run check` | lint + typecheck + `prisma validate` + tests |
| `npm run check:config -- --production` | Pre-deploy gate: the same configuration validation as startup and `/api/health/ready`, but it exits non-zero (names only, never values). Needs Node ≥ 22.6 |
| `npm run check:db-role` | Read-only: reports whether the role in `DATABASE_URL` is least-privilege (owns no tables, cannot rewrite/delete/truncate the audit log, no DDL). Run it with the app's URL after creating the role in `docs/security.md` §15 |
| `npm run check:headers -- <url>` | Checks that a RUNNING server sends HSTS, CSP, framing/sniffing/referrer headers, `no-store` on the API and no framework banner. CI runs it against `next start`; run it against the live URL after a deploy |
| `npm run scoreboard` | Control counts computed from the repository (routes guarded, isolation cases, audit sites, integrity rules, tests); `-- --write` regenerates `docs/scoreboard.md` |
| `npm run shutdown:drill` | Graceful-shutdown drill (SIGTERM with a request in flight). Needs Linux/macOS/WSL; reports SKIPPED on Windows. Not yet run |
| `npm run authz:check` / `authz:matrix` | Fails if an API route has no auth guard or `docs/authorization-matrix.md` is stale / regenerates that file |
| `npm run audit:integrity` | **Read-only** database consistency check (bills ↔ payments ↔ lines, GST maths, tenant links, required DB controls); run after restores, migrations and weekly |
| `npm run licenses` / `npm run sbom` | Production-dependency license inventory (fails on strong copyleft) / CycloneDX SBOM |
| `node scripts/restore-drill.mjs` | Logical backup → restore drill into a scratch schema with content checksums |
| `npm run build:android` | Static-export bundle that Capacitor packages into the APK |

## Documentation

* [Architecture](docs/architecture.md) — layers, multi-tenancy, web + Android, reliability building blocks
* [Security](docs/security.md) — CSRF, rate limiting, sessions, tenant isolation, audit, idempotency, headers, secrets, database roles, known advisories
* [Assurance statement](docs/assurance.md) — maturity per domain with evidence and confidence, residual risks, attack chains, decisions waiting for the owner
* [Business invariants](docs/invariants.md) — the data rules `npm run audit:integrity` checks
* [Operations](docs/operations.md) — graceful degradation, business continuity, who can change what, access register
* [Configuration register](docs/configuration.md) — every environment variable, validation, rotation (including rolling `AUTH_SECRET` rotation)
* [Control scoreboard](docs/scoreboard.md) — generated counts of the controls present (static; not evidence they work today)
* [Authorization matrix](docs/authorization-matrix.md) — generated: every API route, who may call it, where the tenant id comes from
* [API & service conventions](docs/api-conventions.md) — the contract every route/service follows
* [CI/CD & branch protection](docs/ci-cd.md)
* [Disaster recovery runbook](docs/runbook-recovery.md) — backups, RPO/RTO, restore, rollback
* [Architecture decision records](docs/adr/)

## Data

Postgres, via `DATABASE_URL` in `.env` (not committed). `SHADOW_DATABASE_URL` is only needed for `prisma migrate dev` and the CI drift check. `AUTH_SECRET` is the Auth.js session-encryption key — generate a new one for any new deployment with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Money is stored as exact `NUMERIC` (see [ADR-0001](docs/adr/0001-money-representation.md)). Schema changes always ship as a Prisma migration (`prisma migrate dev` locally, `prisma migrate deploy` in production) — never `db push`.

## Self-hosting in production

Deployed on [Render](https://render.com). Render env vars needed: `DATABASE_URL` (Postgres connection string), `AUTH_SECRET`, **`APP_URL`** (the public https URL — password-reset links and the CSRF allow-list are built from it), `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (forgot-password emails — raw SMTP isn't used because Gmail silently stalls connections from cloud-hosting IPs), `GITHUB_RELEASE_REPO` and optionally `GITHUB_API_TOKEN` (used by `/api/app-version`, see below). Optional: `ALLOWED_ORIGINS`, `TRUSTED_PROXY_HOPS`, `DB_POOL_MAX`, `LOG_LEVEL`, `SUPPORT_ACCESS_PASSWORD`, `JOIN_CODE_SECRET` (separate key for operator join codes), `MIGRATE_DATABASE_URL` (schema-owner connection for `prisma migrate deploy` when the app runs as a least-privilege role). The startup log and `/api/health/ready` report invalid or risky configuration (names only).

* Pre-Deploy Command: `npx prisma migrate deploy` — and, to make an invalid production configuration fail the release instead of only turning `/api/health/ready` red, `npx prisma migrate deploy && npm run check:config -- --production` (needs Node ≥ 22.6; whether Render is set that way is UNVERIFIED)
* Health Check Path: `/api/health` (liveness). Alert on `/api/health/ready` (database + config).
* Auto-Deploy: **After CI Checks Pass** — see [docs/ci-cd.md](docs/ci-cd.md).
* The build needs devDependencies (TypeScript, Tailwind, the Prisma CLI) installed — leave Render's default install behaviour.

## Android app

The Android app (`/android`, Capacitor) packages a **static export** of this same UI into the APK (`npm run build:android`); it calls the deployed API cross-origin (`src/lib/api-client.ts`). The UI therefore ships inside the APK: UI changes need a new APK, while API changes must stay backward compatible with older installs ([ADR-0005](docs/adr/0005-web-and-android-from-one-codebase.md)).

**Cutting a new Android release:**

```bash
git tag -a v1.0.3 -m "Dashboard improvements" -m "Bug fixes"
git push origin v1.0.3
```

Each `-m` line becomes a release-notes bullet shown in the in-app update dialog. Add a line containing exactly `[force-update]` to make it mandatory. `.github/workflows/release-android.yml` then builds and signs the APK and publishes it as a GitHub Release; installed apps discover it via `GET /api/app-version`, which reads that release's `version.json`. The updater only downloads HTTPS GitHub release assets and refuses an APK whose SHA-256 does not match.

Required GitHub Secrets (Settings → Secrets and variables → Actions) for the signing key: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
