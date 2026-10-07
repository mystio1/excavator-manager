# Operations: degradation, continuity, change control, access

How the system behaves when a dependency fails, how the business keeps working through a vendor outage, who can change each production asset, and who has access to what.

Status words follow [assurance.md](assurance.md) section 1. **UNVERIFIED** = cannot be seen from this repository (a provider setting, a plan, a person, a production value): the owner fills it in. Everything else was established by reading the code in this repository; nothing was exercised by failure injection except where a test is named. Restore steps live in [runbook-recovery.md](runbook-recovery.md); this document does not repeat them.

## 1. Graceful degradation

**Not applicable here (premises of the usual checklist):** there is no bill e-mail (the password-reset message is the only e-mail the app sends: `sendPasswordResetEmail` has one caller), no PDF service (printing is the browser's print, or Android's print of the rendered bill page), no analytics, and the support console is routes inside the same app, not a separate dependency. There is no offline mode (assurance.md section 7): the app needs a connection.

| Dependency / failure | What happens (from code) | User impact | What still works | Current mitigation | Gap |
|---|---|---|---|---|---|
| **Supabase/Postgres slow or down** | `/api/health` stays 200 (no DB access). `/api/health/ready` answers 503 `database: failed` after a 3 s race. Every authenticated request re-reads the account (`session.ts`), so every authenticated API fails. `withApi` maps Prisma `P2028` (transaction-queue timeout) to a retryable `503 SERVICE_BUSY` + `Retry-After: 2`, and, since 2026-10-07, an unreachable, refusing or saturated database (Prisma `P1001/P1002/P1008/P1017`, `PrismaClientInitializationError`, pool-connect timeout, `ECONNREFUSED`, `EMAXCONNSESSION`, ...) to `503 SERVICE_BUSY` + `Retry-After: 5` with no internals in the body (`isDatabaseUnavailable`, tested in `tests/unit/foundation.test.ts` with simulated errors; a real outage was not induced). Any other database error is still the generic `500 INTERNAL_ERROR`. Transactions: 15 s timeout / 10 s max wait (`tx.ts`); idempotent creates 20 s / 10 s. No `statement_timeout` exists in `src/` or `prisma/` | Cannot sign in (login fails with a server error, never "wrong password": `signin-response.ts`), cannot read or write. A write that timed out committed nothing | `/api/health`, `/api/app-version`, the Android app shell (bundled UI), pages already open in the browser | Each financial create is one transaction (all or nothing), safe to retry with its `Idempotency-Key` (ADR-0002). Liveness/readiness split, so a database blip does not restart the service. Restore path: runbook scenario D | The client never retries or honours `Retry-After` (`api-client.ts`, no special case for `SERVICE_BUSY`). No statement timeout. No alert on `/ready` (NOT DONE, assurance.md section 7). No "service busy" banner |
| **Resend down, key missing or sender unset** | `POST /api/auth/forgot-password`: rate limits, then answers `{submitted:true}` at once; the work runs in `after()`. `requestPasswordReset` writes the hashed token (1 h) to the DB first, then `sendPasswordResetEmail` (10 s timeout) throws if `RESEND_API_KEY` or `RESEND_FROM_EMAIL` is unset or Resend answers non-2xx. `requestPasswordResetQuietly` logs `password reset email failed` and swallows it | The user is told the request was submitted but receives nothing. Nobody is notified | Everything else: login with a known password, operator PIN login, billing, payments, a signed-in owner changing the password (needs the current password) | Replace-on-new-request token; per-email limit (3/hour) and per-IP limit (5/15 min); startup warning if `RESEND_API_KEY` is unset in production | **No retry, queue or outbox**: a failed mail is lost. `RESEND_FROM_EMAIL` is not validated, so readiness stays green with mail broken. A lost `after()` task (restart between response and send) is also lost. No alert on the log line. No support-side password reset exists (support routes: login, logout, businesses, freeze, limits, clear-data, impersonate); an owner who forgot the password during a Resend outage can only wait, or get a manual database update from whoever holds the DB credential (not a documented procedure) |
| **GitHub down** (api.github.com, release assets) | `GET /api/app-version`: 8 s timeouts, 1 MB / 64 KB size caps, every failure becomes a `502` with a stable string (`release_check_failed`, ...); `503 not_configured` if `GITHUB_RELEASE_REPO` is unset. Next caches the fetches for 120 s | Android only: no update prompt (`update-dialog.tsx` swallows a failed check). If an update dialog is already open and the APK download fails, it shows an error and offers a retry. A `[force-update]` dialog is not dismissible, so those users are blocked until the download works. Web users unaffected | The whole app, on the installed (older) APK; the API stays backward compatible (ADR-0005) | Non-mandatory check never blocks use; SHA-256 verified download; SSRF-pinned asset URL | No mirror of the APK or `version.json`. A GitHub outage also stops CI, tag releases and (if Render deploys from GitHub: UNVERIFIED) deploys, so a fix cannot ship by the normal path. No documented emergency deploy path |
| **Render cold start, restart or deploy** | The process is stateless: sessions are JWT cookies re-checked against the DB; rate-limit counters and idempotency keys are in Postgres (`rateLimit.ts`); the pool is rebuilt on boot. A failing migration fails the pre-deploy step and the previous release keeps serving (runbook 3B) | First request after a spin-down or restart is slow or fails; a request in flight at SIGTERM may be cut (**UNVERIFIED**, assurance.md section 7). The client has no timeout or retry, so the user re-taps | Sessions survive (30-day JWT); no data is lost; a retried bill/payment is safe when it carries an `Idempotency-Key` (old APKs send none: no replay protection) | Pre-deploy `prisma migrate deploy`; Render rollback; Health Check Path `/api/health` (setting UNVERIFIED) | Render plan, instance count and whether the service spins down are UNVERIFIED. No uptime monitor or keep-warm. Rolling-deploy overlap window (runbook 3B). No custom graceful-shutdown code in `src/` |
| **Excel export fails** | `/api/bills/[id]/export` and `/api/bills/export` build the workbook in memory (`exceljs` `writeBuffer`; the register is capped at 20,000 bills) inside `withApi`; any error is a generic 500 JSON | Only the download fails. Android shows an alert "Download failed (500)". Web uses a plain `<a href download>`: no in-app message (browser behaviour UNVERIFIED) | The bill record, the on-screen bill, printing, payments | No side effects; tap again | No in-app error on web. Whole file built in memory in one request (Render memory limit UNVERIFIED). No scheduled export, so there is no recent copy to fall back on (section 2) |
| **Image upload too large** (letterhead) | Browser down-scales first (security.md section 10). Server: body cap about 1.6 MB for `PATCH /api/settings/letterhead` -> `413 PAYLOAD_TOO_LARGE` ("each image may be at most 300 KB"); each changed image must be PNG/JPEG/WebP by magic bytes, <= 300 KB decoded, <= 2000 px -> `422`. All other JSON routes: 512 KB cap -> 413 | The letterhead is not saved; a message is shown; the stored letterhead is unchanged | Everything else; bills already issued keep their frozen letterhead (`Bill.letterhead`) | Streamed byte counting, magic-byte checks (AUTOMATED per assurance.md) | Hosting-proxy body limits UNVERIFIED. No per-tenant storage quota; the images are copied into each bill's letterhead JSON (security.md section 10, "partially addressed"), so the database grows with bills |
| **Rate-limit table unavailable** (`RateLimitBucket`) | **Fails closed.** `consumeRateLimit` has no try/catch, so a DB error propagates through `checkRateLimits` / `enforceAuthLimits` / `enforceRateLimits`. Callers: owner and operator login, register, forgot/reset password, app-lock PIN, change password, support login, operator signup. Only the post-success refund and the 1% cleanup are best-effort (logged warning) | Those endpoints return a generic 500 (login does not say "wrong password"). Users with a valid session keep working: other endpoints do not call the limiter | All authenticated work, reads and writes | Deliberate: for credentials, failing closed is the safer default (`auth-throttle.ts`). The table lives in the same database, so it rarely fails alone | No distinct error or alert. No emergency fail-open switch, so a damaged table locks everyone out of signing in. Cleanup is opportunistic (about 1% of calls) |
| **Idempotency table** (`IdempotencyKey`) | Key row is inserted in the same transaction as the bill/payment. If the table or DB fails, the transaction fails and **nothing is created** (no duplicate possible). With no header (old APKs) no row is written and the create works unprotected. A failed purge only logs a warning | Creating a bill/payment with a key fails with 500 (or 503 `SERVICE_BUSY` on `P2028`); retry with the same key | Reads and edits of existing records (edits use `expectedVersion`, not idempotency keys) | Unique index (ADR-0002), 50-way concurrent-billing test, keys expire after 48 h | Purge is opportunistic (about 1% of calls), no scheduled job. A same-key retry after 48 h is treated as a new submission. Stored response bodies grow the table until purged |
| **Supabase pooler connection cap (15)** | `db.ts`: pool `max` = `DB_POOL_MAX` (default 10, clamped to 12), idle 30 s, connect timeout 10 s. The cap of 15 and the `EMAXCONNSESSION` rejection are taken from the comment in `db.ts` / `.env.example`: **the cap itself is UNVERIFIED** here. With every pooled connection busy, a plain query waits up to 10 s then fails with a pool-timeout error (500); an interactive transaction waiting over 10 s gets `P2028` -> 503. A connection refused by the pooler is not mapped -> 500 | Slow or failing requests under concurrency. One owner-operator makes this unlikely today | `/api/health` (no DB). Requests that already hold a connection | Explicit bounded pool, at least 3 connections of headroom, tests run with pool 3-6. Readiness `SELECT 1` uses the same pool | A second instance or the pre-deploy migration during a rolling deploy needs its own connections: two pools of up to 10 exceed 15 if both saturate (arithmetic from the code; pools open connections lazily, so only concurrent load on both hits it; **not tested**). No connection metrics or alert |

### Cheapest improvements (one done)

| Change | Closes |
|---|---|
| ~~Map pool-connect timeout and unreachable-database errors to `503 SERVICE_BUSY` in `with-api.ts`~~ **Done 2026-10-07** (`isDatabaseUnavailable`) | ~~DB-down returns 500~~ |
| One retry honouring `Retry-After` for `SERVICE_BUSY` in `api-client.ts`, and a visible "busy, retrying" message | Manual re-tap after a blip |
| Validate `RESEND_FROM_EMAIL` in `config-check.ts`; log reset-mail failures at a level an alert can match | Silent reset-mail failure |
| Point an uptime monitor at `/api/health/ready` and decide who receives the alert (assurance.md decision 8) | No alerting |
| Set a Postgres `statement_timeout` / `idle_in_transaction_session_timeout` for the app role | A hung query holding a pooled connection |

## 2. Business continuity

Not a business-continuity management system. It answers: if a vendor is down for a day, can the owner still bill, record payments and log hours, and what do they do?

### 2.1 Critical business processes

Tolerable downtime is an **owner decision** (runbook-recovery.md section 1 proposes RTO <= 2 h for the database and RPO <= 24 h as targets "to confirm with the business owner"; nothing has been agreed).

| Process | System parts it needs | Tolerable downtime | Manual fallback until the app is back |
|---|---|---|---|
| Issue a bill (work-based, direct, summary) | Login, DB, `Bill`/`BillNumberSequence` (numbers are generated per business and type) | UNVERIFIED (owner to decide) | Issue the bill on paper or a spreadsheet. Use a number series that cannot collide with the app's (owner decision). Enter it afterwards and record the paper number in the bill's notes (`Bill.notes`) |
| Record a payment | Login, DB, `Payment` (source of truth; `paidAmount` is derived) | UNVERIFIED (owner to decide) | Note receipts (date, amount, mode, bill number); enter them afterwards. Runbook section 1 already assumes payments are re-enterable from paper within a day |
| Operator hour entry (readings, work start/stop, daily log, operator portal) | Operator PIN login or owner entry, DB | UNVERIFIED (owner to decide) | The operator writes the date, machine and hours/meter on paper; the owner enters them afterwards through the machine's daily-log dialog (owner side) |
| Bill printing and export | The bill page (needs the API) for print/PDF; `/api/bills/[id]/export`, `/api/bills/export` for Excel | UNVERIFIED (owner to decide) | **No automated copy exists.** Proposed (not in place): the owner downloads the bills-register Excel export on a regular schedule so a recent list of bills, customers and balances exists outside the system |
| Owner sign-in / password recovery | Login, Resend for reset mail | UNVERIFIED (owner to decide) | Keep the password in a password manager; see the Resend row in section 1 |

### 2.2 Vendor dependency map and outage procedure

| Vendor | Used for | If it is out | Workaround | First action | Contact / support tier |
|---|---|---|---|---|---|
| Render | Hosting of the web app and API, environment variables, logs, deploys | Web and API down for every client **including every installed APK** (`API_BASE` in `src/lib/api-client.ts` is hard-coded to `https://excavator-manager.onrender.com`) | Paper fallback (2.1) | Check the provider status page; runbook scenario A (bad deploy) or E (lost service/account) | UNVERIFIED (owner to fill) |
| Supabase | The only database (Postgres), backups/PITR | Everything except health and the app shell stops | Paper fallback (2.1); restore into any Postgres 16 (runbook scenario D) | Provider status page; decide wait vs restore; run `npm run audit:integrity` after any restore | UNVERIFIED (owner to fill); backup/PITR plan UNVERIFIED |
| GitHub | Source, CI, Android releases and `version.json`, signing secrets | App keeps running; no CI, no tag release, no APK update; deploy path UNVERIFIED | None needed for running the business; a code fix waits | Wait; do not rotate the signing key to "fix" this (a new key is a new app identity for sideloaded updates: runbook scenario F) | UNVERIFIED (owner to fill) |
| Resend | Password-reset e-mail only | Reset mail is lost silently (section 1) | Owners who know their password are unaffected | Fix the key/sender; tell a locked-out owner to retry after recovery | UNVERIFIED (owner to fill) |
| Domain / DNS | The public URL (`APP_URL`, CSRF origin allow-list) | Custom domain unreachable. The onrender.com host (used by the APK) keeps working if listed in `ALLOWED_ORIGINS` | Use the onrender.com URL | Registrar and DNS provider are not visible from the repo: UNVERIFIED | UNVERIFIED (owner to fill) |

**APK hostname risk.** Losing or renaming the Render service breaks every installed APK until a new APK with a new `API_BASE` is built and distributed through the old host. Runbook scenario E does not mention this: keep the service name, and ship a new APK before retiring an old host.

### 2.3 Key-person risk

Single owner-operator: every account and secret below has one human behind it (UNVERIFIED whether anyone else holds a copy).

| Risk | What exists | Gap |
|---|---|---|
| Owner unavailable or locked out | Repository reproduces the schema (migrations) and the app; variable names are in `.env.example`; runbook is written for a non-author | No second person with account access or sealed emergency access (UNVERIFIED); provider restore never performed (runbook header); no one else has rehearsed the runbook |
| Lost second factor, lost keystore | Signing keystore is in GitHub secrets only (README) | An offline encrypted copy of the keystore and recovery codes: UNVERIFIED |

### 2.4 Where credentials and recovery information live

| Item | Where the repo says it lives | Where it actually lives | Backup / recovery copy |
|---|---|---|---|
| `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `AUTH_SECRET`, `JOIN_CODE_SECRET`, `SUPPORT_ACCESS_PASSWORD`, `RESEND_API_KEY`, `GITHUB_API_TOKEN` | Render environment variables and a local git-ignored `.env` (runbook section 2; security.md section 12) | UNVERIFIED | UNVERIFIED |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | GitHub Actions secrets (README) | UNVERIFIED | UNVERIFIED |
| Render, Supabase, GitHub, Resend, domain-registrar logins and recovery codes | Not in the repo | UNVERIFIED | UNVERIFIED |
| Database backups | Supabase plan feature (runbook section 2) | UNVERIFIED | UNVERIFIED; logical drill only: `node scripts/restore-drill.mjs` |

### 2.5 Emergency contacts and communication (owner to fill)

| Who | When to contact | Channel | Name / number |
|---|---|---|---|
| Owner-operator | Any outage | - | UNVERIFIED |
| Backup person | Owner unreachable | - | UNVERIFIED |
| Operators (portal users) | Outage longer than the tolerable downtime: tell them to log hours on paper | UNVERIFIED | UNVERIFIED |
| Render / Supabase / GitHub / Resend / registrar support | Vendor-side fault | Dashboard support or status page | UNVERIFIED |

### 2.5b Backup and restore evidence (audit point 38)

What was **actually verified**, what was **not**, and what only the owner can do. Nothing here claims a provider backup was restored.

| Item | Status | Evidence / exact action |
|---|---|---|
| Our ability to rebuild the data from a full dump into a brand-new schema built from every migration | **VERIFIED (manual run, 2026-10-08 01:42 IST), development database** | `node scripts/restore-drill.mjs`: 26 tables restored with identical row counts and content checksums; dump 1.3 s + schema build 12.3 s + restore 0.9 s = **14.5 s end to end**. Earlier run 2026-10-05: 19.1 s. The dataset is tiny (5 businesses, 2 bills), so this is a lower bound, not a prediction for a larger database. It proves our migrations and a full reload reproduce the data; it says nothing about the provider's backups |
| Supabase plan, backup frequency, retention, PITR on/off, who can restore | **NOT VERIFIED: cannot be read from the repository or from this environment** | Owner: Supabase Dashboard > the project > Database > Backups. Write down (a) plan, (b) whether daily backups or PITR are on, (c) retention in days, (d) who can restore. Put the answers in the table in 2.4 |
| A real provider restore | **NOT PERFORMED** | Owner (about 30 minutes): Dashboard > Database > Backups > restore the latest backup into a **new project or branch** (never over production). Then point a local checkout at it: `npx prisma migrate status` (must say up to date), `npm run audit:integrity` (every *error* rule must pass), log in, open a bill. **Write down how long the restore took**: that is the real RTO. Delete the scratch project |
| Realistic recovery objectives | **PROPOSED, not agreed** | RPO: up to 24 h if only daily backups are on (minutes with PITR). RTO: scripted rebuild of today's data is seconds; a provider restore is unmeasured and grows with database size, so plan for hours until the restore test above gives a number. Owner: confirm or change these in docs/runbook-recovery.md section 1 |

Blocks production? The unverified provider restore is the single remaining item the audit treats as a production blocker: without it nobody knows the backups work.

### 2.6 Recovery verification

Use runbook-recovery.md: section 7 ("After any recovery": `npm run audit:integrity`, `/api/health/ready`, owner and operator login, newest bill, a throwaway payment, audit-flow check) and section 5 (provider restore test). Status: never rehearsed against production; provider restore never performed.

## 3. Who can change what

"Owner (UNVERIFIED who else)" means the only person the repository evidences; actual membership of GitHub, Render, Supabase and Resend is not visible from it. No `CODEOWNERS`, `render.yaml`, Dockerfile or other infrastructure-as-code file exists in the repo.

| Asset | Mechanism | Who today | Approval needed | How it is audited | Gap |
|---|---|---|---|---|---|
| Production deploy (web/API) | Merge/push to `main` -> CI (`ci.yml`) -> Render Auto-Deploy "After CI Checks Pass" -> pre-deploy `npx prisma migrate deploy`. Rollback in the Render dashboard | Owner (UNVERIFIED who else) | None enforced by the repo. Branch protection and required checks are recommended in ci-cd.md but UNVERIFIED | Git history; GitHub Actions runs; Render deploy events / audit log UNVERIFIED | No `CODEOWNERS`, no required reviewer; whether "After CI Checks Pass" is set is UNVERIFIED; a manual dashboard deploy path is UNVERIFIED |
| Database schema / migrations | Prisma migrations in `prisma/migrations/`, applied by the pre-deploy command; CI checks fresh apply, drift and upgrade-with-data. Anyone holding the DB credential can also run SQL | Owner (UNVERIFIED who else) | Same as deploy | `git log prisma/migrations`; `_prisma_migrations` table; Supabase logs UNVERIFIED. Direct SQL is **not** in the in-app audit | The app connects as the schema owner (UNVERIFIED for production; security.md section 15): that credential can alter schema and disable the audit trigger. Least-privilege role documented, not applied |
| Secrets / environment variables | Render env vars; GitHub Actions secrets; local `.env`. Register: [configuration.md](configuration.md) | Owner (UNVERIFIED who else) | None | Render and GitHub audit logs UNVERIFIED (plan dependent). Nothing in-app | No rotation log. `AUTH_SECRET` change signs everyone out. Exposed DB and mail credentials await rotation (assurance.md decision 1) |
| Support-console password | `SUPPORT_ACCESS_PASSWORD` env var in Render; unset = console disabled (404). One shared password | Owner (UNVERIFIED who else holds it) | None | Changing the variable: provider log only. **Use** is audited: `SupportSession` rows and `AuditLog` rows with `actorType = 'SUPPORT'`, each with a written reason | No MFA, no per-person identity, no second approver, no alert on use, no idle timeout (assurance.md section 3) |
| Android release and signing keystore | Push a `v*` tag (or run the workflow manually) -> `release-android.yml` builds, signs with four GitHub secrets, publishes APK + `version.json` + SBOM. Installed apps then self-update from it | Anyone with tag-push or Actions rights on the repo, plus whoever can read the secrets (Owner; UNVERIFIED who else) | None: no `environment:` approval gate, tests are not re-run, no provenance attestation | Git tags, GitHub Release and Actions history only | A tag push ships code to every installed device (assurance.md section 5, compound chain). Keystore backup UNVERIFIED. With no keystore env the Gradle build falls back to **debug signing** |
| DNS / domain | Not visible from the repo (`APP_URL`, `ALLOWED_ORIGINS` only; `src/lib/config.ts` uses an example domain in a comment, not evidence of the real one) | UNVERIFIED | UNVERIFIED | UNVERIFIED | Registrar, DNS host, renewal date, lock and 2FA unknown |
| Render account | Dashboard | Owner (UNVERIFIED who else) | n/a | Provider audit log UNVERIFIED | Members, roles, 2FA unknown |
| Supabase account | Dashboard, database credentials | Owner (UNVERIFIED who else) | n/a | Provider logs UNVERIFIED | Members, roles, 2FA, backup plan unknown |
| GitHub account / repository | Repo settings, Actions secrets | Owner (UNVERIFIED who else) | n/a | GitHub audit log UNVERIFIED | Collaborators, branch protection, 2FA, secret scanning unknown |
| Resend account | Dashboard, API key | Owner (UNVERIFIED who else) | n/a | Provider log UNVERIFIED | Key scope (full vs send-only) and members unknown |
| In-app business data and settings | The application, by role (owner, operator, support): [authorization-matrix.md](authorization-matrix.md). Operator readings and work requests need owner approval | Owners and operators of each business; support console | Operator entries: owner approve/reject routes exist | **`AuditLog`**: append-only (trigger), written in the same transaction, with actor, before/after, reason, request id | Not tamper-evident against a privileged DB insider (assurance.md section 4) |

## 3.5 Asset inventory (what exists, where, and what is not known)

What the repository shows, one row per asset. Everything in the "Not known from the repository" column is
UNVERIFIED and is for the Owner to fill in: it cannot be read from the code.

| Asset | What / where (from the repository) | Data class | Recovery path | Not known from the repository |
|---|---|---|---|---|
| Web application + API | One Next.js service (`next start`), built from `main` ([ADR-0007](adr/0007-single-deployable-architecture.md)) | Serves all tenant data | Re-deploy from git; stateless | Render plan, instance count, region, custom domain |
| Database | Postgres on Supabase, pooled connection; schema in `prisma/migrations` | All business, personal and audit data | Provider backups/PITR; logical drill ([runbook-recovery.md](runbook-recovery.md) §6) | Plan, backup frequency/retention, PITR, who can restore, region |
| Object storage / file store | **None.** Logos and signatures are stored as data URLs in the database; exports are generated in memory and not stored | n/a | n/a | n/a |
| Source code and CI | GitHub repository, four workflows ([ci-cd.md](ci-cd.md)) | Code, CI-only secrets | Any clone | Collaborators, branch protection, 2FA, secret scanning |
| Android app | Capacitor shell, signed APK published as a GitHub release asset; the updater only accepts that release | Bundled UI, no tenant data at rest except what the app caches | Rebuild from a tag with the keystore | Where the keystore and its passwords are kept besides the GitHub secrets; Play Store: not used |
| E-mail | Resend: password-reset mail only | Recipient address, reset link | None needed (retry by the user) | Account owner, sending domain, key rotation date |
| Secrets | Environment variables ([configuration.md](configuration.md)) and four GitHub secrets for signing | Credentials | Re-generate; some invalidate sessions | Where each lives, who can read it, when it was last rotated |
| DNS and domain | The public `APP_URL`; the onrender.com host is also allowed for the APK | None | Registrar | Registrar, DNS host, expiry, who holds the account |
| TLS certificates | Terminated by Render; the app sets HSTS on production responses | None | Automatic renewal by the host | Certificate issuer and expiry (check with `npm run check:headers -- <url>` and a browser) |
| Support console | `/support`, off unless `SUPPORT_ACCESS_PASSWORD` is set | Cross-tenant read/write | Unset the variable | Whether it is enabled in production; who knows the password |

## 4. Access register

**Statement.** Single-operator ownership: a formal multi-person access review is not applicable yet, but privileged-access boundaries are documented (this section, [authorization-matrix.md](authorization-matrix.md), assurance.md section 3). The register is still reviewed **quarterly**, matching assurance.md section 11, because accounts and secrets exist whatever the headcount. Do not fake approvals: record what is true.

### 4.1 Register (template, with what the repo can show)

| Principal | Why it has access | Scope | Since | Last reviewed | How to review |
|---|---|---|---|---|---|
| Owner login(s) of each business (`User.role = 'OWNER'`) | Runs the business | Full data of that business only (tenant id comes from the session) | `User.createdAt` (query 1) | Never recorded (UNVERIFIED) | Query 1; compare with the people you expect. Revoke: password change or "Sign out everywhere" (bumps `tokenVersion`); support can freeze |
| Login-enabled operators (`Operator.canLogin` and not `isArchived`) | Enter hours and work requests through the PIN portal | Operator portal routes of their business only | Query 3 (last login enabled / PIN set, from the audit trail). **No last-login field exists** in the schema, so "last used" cannot be answered | Never recorded (UNVERIFIED) | Queries 2 and 3. Revoke: disable login or archive the operator; effective at once (`session.ts` re-checks `canLogin`, `isArchived` and `tokenVersion` on every request; tested in `tests/auth/session-validity.test.ts`, `tests/operator-join/operator-admin.test.ts`). An operator who has left keeps access only until the owner does this |
| Pending join requests | An operator asked to join; no access until approved | Becomes operator access on approval | `OperatorJoinRequest.createdAt` | Never recorded (UNVERIFIED) | Query 6 |
| Support-password holders | Platform support and troubleshooting | **All businesses**: list, freeze, limits, clear data, impersonate | UNVERIFIED (one shared secret, no per-person identity) | Never recorded (UNVERIFIED) | Ask each holder; check use with queries 4 and 5. Revoke by changing `SUPPORT_ACCESS_PASSWORD` in Render (support sessions are DB-backed and last at most 1 h) |
| GitHub repo members, collaborators, tokens | Source, CI, releases | Repo, Actions secrets, release signing | UNVERIFIED | UNVERIFIED | GitHub -> Settings -> Collaborators / Secrets; review `GITHUB_API_TOKEN` scope |
| Render team members | Hosting, env vars, deploys | Production runtime and every secret in it | UNVERIFIED | UNVERIFIED | Render dashboard -> team settings |
| Supabase org/project members, DB credential holders | Database | All data, bypasses application controls | UNVERIFIED | UNVERIFIED | Supabase dashboard -> members; who holds the DB password. The code reads no Supabase API keys, only `DATABASE_URL` |
| Resend account / API key holders | Send reset e-mail | Send mail as the configured sender | UNVERIFIED | UNVERIFIED | Resend dashboard -> API keys, members |
| Android signing-secret holders | Sign APKs | Identity of the installed app | UNVERIFIED | UNVERIFIED | GitHub secrets; where any offline keystore copy lives |
| Domain registrar / DNS | Public URL | Where the domain points | UNVERIFIED | UNVERIFIED | Registrar dashboard |

### 4.2 Read-only SQL (not executed)

**Not executed.** Written from `prisma/schema.prisma` only (default Prisma table and column names; the schema has no `@map`). Run in a read-only session (`BEGIN READ ONLY;` ... `ROLLBACK;`) against production or a restored copy. Output is ids, counts and timestamps only: no names, mobile numbers, e-mails or hashes.

```sql
-- 1. Owner logins per business
SELECT u."businessId",
       count(*)           AS owner_logins,
       min(u."createdAt") AS oldest_created,
       max(u."createdAt") AS newest_created
FROM "User" u
WHERE u."role" = 'OWNER'
GROUP BY u."businessId"
ORDER BY owner_logins DESC, u."businessId";

-- 1b. Any role other than OWNER? (expected: none)
SELECT "role", count(*) FROM "User" GROUP BY "role";

-- 2. Operator portal logins per business
SELECT o."businessId",
       count(*) FILTER (WHERE NOT o."isArchived")                  AS operators_active,
       count(*) FILTER (WHERE o."canLogin" AND NOT o."isArchived") AS portal_logins_active,
       count(*) FILTER (WHERE o."canLogin" AND o."isArchived")     AS archived_but_flag_still_set
FROM "Operator" o
GROUP BY o."businessId"
ORDER BY portal_logins_active DESC, o."businessId";

-- 3. Which operator ids hold an active login, and when it was last granted or the PIN last changed
--    (NULL = no such audit event; use the operator row's createdAt)
SELECT o."id" AS operator_id, o."businessId", o."createdAt" AS operator_row_created,
       (SELECT max(a."createdAt")
          FROM "AuditLog" a
         WHERE a."businessId" = o."businessId"
           AND a."entityId"   = o."id"
           AND a."action" IN ('operator.login.enable','operator.pin.set','operator.pin.reset','operator.create')
       ) AS login_last_granted_or_pin_changed
FROM "Operator" o
WHERE o."canLogin" AND NOT o."isArchived"
ORDER BY o."businessId", o."createdAt";

-- 4. Support console usage (sessions opened)
SELECT count(*)                                                    AS sessions_total,
       count(*) FILTER (WHERE s."createdAt" > now() - interval '90 days') AS sessions_last_90d,
       max(s."createdAt")                                          AS last_opened,
       count(*) FILTER (WHERE s."revokedAt" IS NOT NULL)           AS revoked
FROM "SupportSession" s;

-- 5. What support did (actions only; each row carries a written reason in "reason")
SELECT a."action", count(*) AS n, max(a."createdAt") AS last_at
FROM "AuditLog" a
WHERE a."actorType" = 'SUPPORT'
GROUP BY a."action"
ORDER BY last_at DESC;

-- 6. Pending or recent operator join requests (counts only)
SELECT j."businessId", j."status", count(*) AS n, max(j."createdAt") AS latest
FROM "OperatorJoinRequest" j
GROUP BY j."businessId", j."status"
ORDER BY j."businessId", j."status";
```

### 4.3 Cadence and review log

| Cadence | What |
|---|---|
| Quarterly (assurance.md section 11) | Run queries 1-6; walk every row of 4.1 including the provider rows; rotate secrets that changed hands; record below |
| Event-driven | An operator leaves: disable login or archive the same day. Someone who knew the support password leaves: rotate `SUPPORT_ACCESS_PASSWORD`. A device is lost: owner "Sign out everywhere" |

| Date | Reviewer | Rows reviewed | Changes made |
|---|---|---|---|
| Never (UNVERIFIED: no review is recorded in the repo) | | | |
