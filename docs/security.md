# Security

How the application defends itself, what it deliberately does *not* do, and what
still has to be configured outside the code. Everything below is implemented in
this repository. Application logic (CSRF rules, rate limits, sessions, tenant isolation,
audit, idempotency, money, join flow) has automated tests; the security headers/CSP, the
health endpoints and the Android hardening were verified by hand (browser run, `curl`, build)
rather than by automated tests; anything not verified is marked **UNVERIFIED**.
For a per-domain maturity rating, the evidence behind each claim, residual risks and the
decisions still waiting for the owner, read [assurance.md](assurance.md); the data rules the
database must always satisfy are in [invariants.md](invariants.md).

## 1. Threat → control summary

| Threat | Control | Where |
|---|---|---|
| Cross-site request forgery against the cross-site (`SameSite=None`) session cookie | Origin / `Sec-Fetch-Site` check on every POST/PUT/PATCH/DELETE → `403 CSRF_VALIDATION_FAILED` | `src/lib/csrf.ts`, `src/proxy.ts`, `tests/unit/csrf.test.ts` |
| Brute-forcing passwords, operator PINs, app PIN, support password; signup abuse; email spam | DB-backed sliding-window rate limits per IP **and** per account | `src/lib/rateLimit.ts`, `src/lib/auth-throttle.ts`, `tests/auth/**` |
| Stolen / stale session | `tokenVersion` revocation, frozen-account check on every request | `src/lib/session.ts`, `src/lib/api-auth.ts` |
| Operator account takeover via business code + mobile | Join *requests* with a one-time verification code and explicit admin approval | `src/lib/services/operators.ts`, `tests/operator-join/**` |
| Cross-tenant data access | Every query scoped by `businessId` from the verified session; two-tenant tests | `src/lib/services/**`, `tests/**/tenant-isolation*.test.ts` |
| Silent or untraceable financial edits | Append-only audit trail written in the same transaction | `src/lib/audit.ts`, DB trigger |
| Double billing / double payment / lost updates | UNIQUE constraint, row locks, CHECK constraints, idempotency keys, optimistic concurrency | ADR-0002, ADR-0006 |
| Money rounding drift | `NUMERIC` + `Decimal` arithmetic | ADR-0001 |
| Password-reset poisoning | Reset links built from `APP_URL`, never from request headers | `src/lib/config.ts` |
| Clickjacking, MIME sniffing, mixed content, injected scripts | Security headers + CSP on the web build | `next.config.ts` |
| Malicious update APK | HTTPS GitHub release assets only, mandatory SHA-256, install only the downloaded file | `UpdateInstallerPlugin.java` |
| Data leakage via errors/logs | Standard error contract (no stack/DB detail to clients); log redaction | `src/lib/with-api.ts`, `src/lib/logger.ts` |

## 2. CSRF

The session cookie is `SameSite=None; Secure` in production because the Android
app calls the API cross-origin (ADR-0004). `checkCsrf()` runs in `src/proxy.ts`
for POST/PUT/PATCH/DELETE:

1. `Origin` present → must be `APP_URL`, an entry of `ALLOWED_ORIGINS`, the
   Capacitor Android origin (`https://localhost`), or have the same host as the
   request (`Host` / `X-Forwarded-Host`). `Origin: null` and malformed values are
   rejected.
2. No `Origin` → `Sec-Fetch-Site` must be `same-origin` or `none`.
3. Neither header → allowed only if the request carries no session cookie.

Rejections are `403 {"code":"CSRF_VALIDATION_FAILED"}`. CORS is *not* relied on.
Set `APP_URL` (and `ALLOWED_ORIGINS` if you serve the app from a second
hostname) or your own browser requests will be rejected.

## 3. Rate limiting

Counters live in the `RateLimitBucket` table (sliding-window counter), so they
are shared by all instances and survive restarts/deploys. Render's free tier
spins the process down and a deploy restarts it — an in-memory limiter would
reset every time. Cost: roughly two small queries per rule per attempt (owner login evaluates three
rules), only on authentication-type endpoints.

**Client IP.** `clientIp()` takes the `X-Forwarded-For` entry that is
`TRUSTED_PROXY_HOPS` positions from the **right** (the one our own proxy
appended) — never the left-most, which a client can forge. With no forwarded
header it returns `unknown` and the per-IP bucket is scaled up so legitimate
users sharing "unknown" are not locked out; **per-account limits always apply**.
`TRUSTED_PROXY_HOPS` must match the real proxy chain (Render: 1; add one if you
put Cloudflare or another proxy in front). *Whether Render appends exactly one
hop is UNVERIFIED from the repo — confirm with a test request in production.*

| Endpoint | Limits |
|---|---|
| Owner login | IP 20 / 15 min · account 8 / 15 min · account 40 / 24 h |
| Operator login (PIN) | IP 20 / 15 min · mobile 5 / 15 min · mobile 20 / 24 h |
| Register | IP 5 / hour |
| Forgot password | IP 5 / 15 min · email 3 / hour |
| Reset password | IP 10 / 15 min |
| App-lock PIN (verify/change/disable, shared budget) | 5 / 5 min · 20 / 24 h |
| Support login | IP 3 / 15 min (checked first; a blocked IP does not drain the next) · platform-wide 30 failed / day |
| Operator join request | IP 10 / hour · mobile 5 / hour · business code 30 / hour · invalid codes 5 / 15 min per IP |

Responses are `429 {"code":"RATE_LIMITED"}` with `Retry-After`. A *successful*
login gives its attempt back, so normal use never accumulates toward a lock-out.
Trade-off: per-account limits let an attacker temporarily lock a victim out of
login attempts (not out of an already-signed-in session); this is the usual
choice for credential-stuffing defence.

## 4. Authentication and sessions

* NextAuth v5, JWT sessions, three credential providers (owner, operator,
  support-impersonate).
* **No enumeration**: unknown account and wrong password return the same 401; a
  dummy bcrypt comparison runs for unknown accounts so timing does not differ;
  `423 frozen` is only revealed after the password verified; forgot-password
  always answers `{ "submitted": true }` and does its work after responding.
  (Registration necessarily reports an already-used email/phone.)
* **Revocation**: `User.tokenVersion` / `Operator.tokenVersion` are embedded in
  the JWT and compared with the database on every request in the same query that
  loads the business. A password reset/change, an operator PIN set/reset/disable,
  archiving, or deleting the account invalidates every previously issued session.
  A frozen business is blocked immediately (423) on the next request.
* **Passwords**: new passwords need ≥ 8 characters, at least one letter and one
  digit, ≤ 72 bytes (bcrypt limit); bcryptjs. Login accepts existing passwords
  unchanged so nobody is locked out. A signed-in user can change their password
  via `POST /api/auth/change-password` (other devices are signed out).
  It is available in Settings → Change Password, and is refused during a support
  impersonation session.
* **Session lifetime**: the session cookie is an HttpOnly, Secure, `SameSite=None` JWT with an
  explicit 30-day maximum (`src/lib/auth.ts`). The lifetime is not the only gate: every request
  re-checks the account in the database, so revocation is immediate, not at expiry.
* **Sign out everywhere**: Settings → "Sign out of all devices" (`POST /api/auth/sign-out-everywhere`)
  bumps `User.tokenVersion`, ending every session on every device including the caller's, without a
  password change. Audited (`auth.signOutEverywhere`). Refused in a support session.
* **Reset tokens**: 32 random bytes, only the SHA-256 is stored, 1 hour expiry,
  single use. The emailed link uses `APP_URL`.
* **Support console** (`/support`): unusable unless `SUPPORT_ACCESS_PASSWORD` is set
  (its login endpoint answers 404; the page itself still renders a login form). Login (constant-time compare, rate limited) creates a `SupportSession`:
  random token, only its hash stored, 1-hour expiry, revocable
  (`POST /api/support/logout`). It no longer shares `AUTH_SECRET` with owner
  sessions. Impersonation, freeze, limits and clear-data each **require a written reason**
  (≥ 5 characters; 422 without one) and are written, with it, to the target business's audit
  trail; clear-data never deletes audit rows. Edits made
  *while* impersonating are audited as actor `SUPPORT` (never as the owner) with the
  support session id and the impersonated account, and a few owner-credential actions
  (change password, app-lock PIN) are refused in a support session.

## 5. Operator join flow

An operator who wants to join a business now files a **join request**
(`OperatorJoinRequest`); nothing about an existing operator changes.

1. The operator enters business code, name, mobile and a PIN (4–8 digits). The PIN
   is stored hashed *on the request only*.
2. They receive a **6-digit verification code once** (in the response; old apps
   show it inside the message text). Only an HMAC of it is stored.
3. The admin sees the pending request and must type the code the operator reads
   out. A request filed by someone else is therefore detectable: the real
   operator never received a code. 5 wrong codes lock the request; it also
   expires after 7 days; approving twice fails.
4. Approval links the request to the matching operator record (or creates one),
   sets the PIN, `canLogin = true` and bumps `tokenVersion`. It refuses to
   overwrite an operator that already has working credentials.
5. Legacy requests created before this change have no code and approve without
   one. Older **admin** apps that still call `/api/operators/[id]/approve-join`
   can approve legacy requests but get a clear 409 for new, coded requests
   (they must update the app or use the web app).

Business codes are protected from enumeration by the rate limits above (invalid
codes are limited much more tightly than valid requests).

## 6. Tenant isolation

Every service takes `businessId` explicitly from the verified session and every
query includes it; look-ups by id alone are not allowed. There is no database
row-level security (a possible future hardening — it would require a per-request
role/`SET LOCAL` and was not introduced blindly). Isolation is verified by
tests that create two tenants and attempt cross-reads, updates, deletes and
payments in bills, work records, readings, machines, customers, operators and
settings, and by tests that assert dashboard totals never include another
tenant's rows.

Two further guards make this hold as the code grows:

* **Authorization inventory** — `docs/authorization-matrix.md` is generated from the Route
  Handlers (`npm run authz:matrix`). `npm run authz:check` (CI) and
  `tests/unit/route-inventory.test.ts` fail when a route/method has no authentication guard and
  is not on the justified `PUBLIC_ROUTES` list, or when the matrix is stale. The tenant id comes
  from the verified session in every route; no route reads a `businessId` from the body or query.
* **Object-level (BOLA) matrix** — `tests/security/cross-tenant-matrix.test.ts` seeds tenant A
  with one of everything, then as tenant B calls every id-addressed read, update and delete
  handler against A's ids and requires `404 NOT_FOUND` with A's data unchanged, and checks that
  list/search/dashboard feeds never contain A's rows. Cross-tenant ids always answer **404, not
  403 or an empty 200**, so ids cannot be probed for existence. A new id-addressed route must
  be added to that file.

## 7. Audit trail

`AuditLog` records actor (type + id + name), action, entity type/id,
before/after snapshots, reason and request id for: bill create/update/delete,
payment create/update/delete, work-session and reading changes, machine edits,
service records (cost), operator money transactions and work-request decisions,
customer/bank-account/profile/letterhead changes, join-request decisions and PIN
resets, and support actions. Entries are written inside the same transaction as
the change. Credentials, tokens and PIN hashes are stripped; letterhead audit
stores image size + SHA-256 instead of the data URL. Bank account numbers *are*
recorded in snapshots (they print on bills).

The table is append-only at the database level: a trigger rejects UPDATE, DELETE
and TRUNCATE unless the transaction explicitly sets
`app.allow_audit_purge = on` (used by test cleanup and deliberate maintenance).
Consequence: deleting a `User` who has audit rows, or a whole `Business`, requires
that switch.

**What this does not protect against:** the trigger stops the application and ordinary SQL
sessions, not the table owner or a superuser (they can disable the trigger or set the switch
themselves), and not the application's own database credential if that role owns the table.
It is tamper-*resistant* against bugs and casual misuse, not tamper-*evident* against a
privileged insider — there is no hash chain and no external copy. See "Database roles" (§15)
for the cheapest strong mitigation.

## 8. Money and concurrency invariants

* `BillItem.workSessionId` UNIQUE — a work session can be billed once.
* Payments lock the bill row; `paidAmount` is recomputed as the exact sum of
  payments; CHECK constraints refuse `amount <= 0` and `paidAmount > totalAmount`
  (added `NOT VALID`, i.e. enforced for all new/updated rows).
* Editing a bill below what was already paid is refused (`BILL_TOTAL_BELOW_PAID`).
* Fifty simultaneous requests for the same work record bill it exactly once (tested; the test's
  connection pool is 3, so at most 3 run in the database at the same instant and the rest queue —
  it exercises the lock and the unique constraint, not 50-way database parallelism). A request
  that loses the transaction-queue race gets a retryable `503 SERVICE_BUSY` (with `Retry-After`),
  not a hung request or a 500.
* `npm run audit:integrity` re-verifies all of this (and tenant consistency) directly in the
  database — see [invariants.md](invariants.md).
* Optimistic concurrency via `version` / `expectedVersion`; idempotency keys for
  creates. Clients that omit these (installed older apps) are not protected
  against lost updates or retry duplicates — **that protection is only complete
  once old app versions are retired** (use a forced update).

## 9. Security headers and CSP (web build)

`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
`Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`; in production
also `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`, the
parent domain hosts other apps) and a `Content-Security-Policy`
(`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`,
`form-action 'self'`, `connect-src 'self'`, `img-src 'self' data: blob:`).
`/api/*` responses are `Cache-Control: private, no-store`.

**CSP exceptions (documented, not hidden):** `script-src 'unsafe-inline'` because
Next.js emits inline bootstrap scripts (a nonce-based policy needs every page
rendered dynamically through the proxy — a follow-up); `style-src 'unsafe-inline'`
for inline style attributes; `img-src data:` because letterhead logos are stored
as data URLs. No `unsafe-eval`, no third-party script origins.
*Verified:* the production build (`next build` + `next start`) was opened in a
real browser (Edge) as a signed-in owner and eight screens were loaded with a
`securitypolicyviolation` listener: **no CSP violations**, no page errors, no
failed requests (the only console line is the expected 401 from the signed-out
login page). One violation did appear — Zod 4 probing for `eval` support — and
was removed by running Zod in its non-eval mode in the browser
(`src/lib/api-client.ts`). Not covered: every possible screen/dialog, and the
Android WebView (it serves local assets without these headers).
`headers()` is skipped for the Android static build (not supported there; the
APK serves local assets).

## 10. Uploaded images (letterhead)

Server-side validation accepts only `data:image/png|jpeg|webp;base64`, valid
base64, ≤ 300 KB decoded, magic bytes matching the declared type, and PNG/JPEG
dimensions ≤ 2000 px. SVG is rejected (script-capable). The upload field
down-scales large photos in the browser first. Existing bills keep their frozen
letterhead; the embedded images are still copied into each bill (a shared asset
store would be the next step) — **partially addressed**.

## 11. Android app

No cloud backup / device transfer (`allowBackup=false`, data-extraction rules),
cleartext traffic disabled with a network-security config, FileProvider limited
to the two app-private directories the plugins use, updater restricted to HTTPS
GitHub release assets with a **mandatory** SHA-256 and only installs the file it
downloaded itself, `apkUrl` validated server-side too. The release keystore is
a GitHub secret. *Native changes only take effect in a newly built APK.*

## 12. Secrets and configuration

Real values live only in the hosting provider's environment and a local
git-ignored `.env`; `.env.example` lists names only. `.env` has never been in
git history (verified). If a secret was ever pasted into a chat, ticket or log,
treat it as compromised: **revoke → rotate → verify**.
Logs redact keys matching password/pin/token/secret/authorization/cookie/hash.

Keys are separated by purpose: `AUTH_SECRET` signs/encrypts sessions (roll it without a sign-out via
`AUTH_SECRET_PREVIOUS`, [configuration.md](configuration.md) section 8 — tested against Auth.js's real JWT code), `JOIN_CODE_SECRET` keys the
join-code HMAC (falls back to `AUTH_SECRET` when unset), the database credential is its own
secret, and support sessions use random DB-backed tokens that depend on no signing key.
`MIGRATE_DATABASE_URL` (optional) lets the Prisma CLI use a schema-owner connection while the
app runs as a least-privilege role (§15).

**Startup validation.** `src/lib/config-check.ts` runs at process start (`src/instrumentation.ts`)
and in `/api/health/ready`: a missing/malformed `DATABASE_URL`, a placeholder or short
`AUTH_SECRET`, or (production) a missing or non-https `APP_URL` is an **error** (readiness → 503,
logged by name only); a shared/missing `JOIN_CODE_SECRET`, a weak support password, and
out-of-range `TRUSTED_PROXY_HOPS`/`DB_POOL_MAX` values that would silently fall back to defaults
are logged as warnings. The process is not killed (a crash loop would hide the reason and take
the liveness probe down); the readiness probe is what an uptime monitor should watch.

## 13. Known dependency advisories

`npm audit --omit=dev`, re-run 2026-10-07: **0 critical**, 10 high, 2 moderate. A **critical**
advisory appeared in between — `@capacitor/android` 8.5.0 (GHSA-rvm3-566m-v7fv: remote content could be
loaded at the app origin through the internal HTTP proxy path) — and CI's critical gate would have
failed on it; it is fixed by upgrading to **8.5.3** (a patch release in the same range). It is native
code, so it takes effect only in an APK built after this change (the release workflow builds from
`node_modules`); installed apps stay exposed until they update, which is a reason to use a forced
update. The three Next.js remote-code-execution advisories that were open on 16.3.2 are fixed by the
upgrade to **16.3.8**. CI fails the build on any
*critical* advisory in production dependencies and Dependabot proposes updates
weekly. What remains, and why it was not "fixed":

| Package(s) | Severity | Reaches the running app? | Disposition |
|---|---|---|---|
| `next-auth` → `@auth/core` → `nodemailer` | high | **No.** The app sends mail through Resend over `fetch`; Auth.js's Nodemailer email provider is not configured, so the vulnerable code is never executed. | Waiting for an Auth.js release. `npm audit`'s suggested "fix" (downgrading `next-auth` to 1.x) is an artefact and would remove the app's authentication. |
| `prisma` → `@prisma/config` → `deepmerge-ts`, `mysql2` | high | **No.** Prisma CLI tooling (migrate/generate); MySQL driver is not used (PostgreSQL only). The CLI now lives in `devDependencies`. | Upgrade with Prisma releases. |
| `brace-expansion`, `fast-uri`, `source-map-js` | high | Build/tooling transitive dependencies (glob matching, URL parsing, source maps in tools), not on a request path. Non-breaking fixes exist (`npm audit fix`), but it also rewrites the lockfile with dozens of unrelated platform packages, so it was not applied wholesale. | Dependabot. |
| `exceljs` → `uuid` | moderate | Buffer-bounds issue only when a caller passes a `buf` argument; `exceljs` does not. | Pinned by `exceljs`; revisit when it updates `uuid`. |

These are risk-accepted, not hidden. Re-run `npm audit --omit=dev` before each
release and re-assess. Evidence quality: the critical-severity gate is AUTOMATED · M (CI step; it
ignores high and moderate); the "reaches the running app?" column is STATICALLY IDENTIFIED · M
(reasoned from the code, not proven by a scanner).

## 14. Limits of this work — read before claiming anything

* No penetration test, no load test and no Android end-to-end run was done. Behaviour is verified
  by typecheck, lint and the automated tests (service-level and route-handler level against a real
  Postgres), plus a few one-off real-browser runs against the production build (CSRF block, the
  security headers, sign-out-everywhere across two browser contexts, the support-console reason
  fields). Those browser runs are not part of CI.
* Production settings (branch protection, Render auto-deploy gating, secret
  scanning, Supabase backups/PITR, Render proxy hop count, env values) are
  **UNVERIFIED** from the repository.
* The real NextAuth `signIn()` path cannot run inside Vitest; throttling and
  enumeration are tested at the service/`authorize()` level, not end to end.
* **Old installed Android apps** (they embed the previous UI) keep working, with these
  known differences until they update: lists beyond the newest 200 rows are not shown
  (bounded legacy page); they cannot approve *new* coded operator join requests (the
  server answers a clear 409 telling the admin to use the web app); they send no
  `Idempotency-Key`/`expectedVersion`, so retries and concurrent edits from them are not
  protected; operator-signup messages are shown in English only.
* **Join verification codes** are keyed with `JOIN_CODE_SECRET`, or `AUTH_SECRET` when that is
  unset. Rotating the key in use invalidates every *pending* coded join request (the admin's
  correct code will no longer match): decline them and ask the operators to file again. A code is shown once;
  if the response was lost, the admin declines the waiting request and the operator
  re-files.
* **Operator login** compares the PIN against at most the five oldest login-enabled
  operators sharing a mobile number (bounded work per attempt); a sixth same-mobile
  account cannot log in until one is archived. Mobile numbers are not unique across
  businesses, which is why the oldest account wins when two share a PIN.
* **Owner-login throttling** is keyed by the identifier typed (an account has separate
  budgets for its email and its phone number).
* **Audit rows written before this release** carry `actorType = OWNER` and an empty
  `entityType`, and being append-only stay that way.
* **Bank account numbers** are stored in audit snapshots (they print on bills).

**Further controls (recorded here so there is one list):**

* **Resource limits.** Request bodies are capped at 512 KB (`413 PAYLOAD_TOO_LARGE`, counted while
  streaming, so a missing or lying `Content-Length` does not bypass it; the letterhead upload has
  its own larger cap), a bill has at most 1000 rows, lists are paginated with a hard maximum page
  size. Hosting-level limits (Render request size/timeouts, Supabase connection caps) are
  **UNVERIFIED** from the repo, and there is no per-tenant storage accounting.
* **Spreadsheet exports** are `.xlsx` with every user-supplied value written as a text cell, never
  a formula (a test re-reads the produced file to prove it); there is no CSV export. Printing/PDF
  is the browser's print of an HTML page.
* **Outbound requests.** The server makes exactly two kinds: GitHub release metadata for
  `/api/app-version` and Resend for e-mail. The only URL derived from remote data (the
  `version.json` asset link) must be an https `github.com` release download of the configured
  repository or the request is not made (SSRF). There are no webhooks and no user-supplied URLs
  fetched server-side.
* **Caching.** Pages and `/_next/static` are public by design; **every `/api/*` response is
  `Cache-Control: private, no-store`** (`next.config.ts`, plus an explicit header on exports), except
  `/api/app-version`, which sets its own short public cache (no tenant data). The browser-side SWR
  cache is a separate matter: it outlives a session because sign-in/out are client-side navigations,
  so it is cleared on every sign-in, sign-up and sign-out (`src/lib/use-clear-client-cache.ts`,
  `tests/unit/client-cache-isolation.test.ts`); before that a second user on the same tab could briefly
  see the first user's cached layout. What Render's edge actually returns is UNVERIFIED: run
  `npm run check:headers -- <live URL>` after a deploy.
* **Health endpoints.** `/api/health` is liveness (no database) and `/api/health/ready` is readiness
  (database within 3 s plus configuration). Render's Health Check Path should be the liveness one, so a
  database blip does not restart the service; the consequence, which the owner should accept knowingly,
  is that a release with a broken database connection or invalid configuration **still takes traffic**
  and only an external monitor on `/api/health/ready` would notice. The pre-deploy gate
  `npm run check:config -- --production` (after `prisma migrate deploy`) is what can stop a bad
  configuration from being released; whether Render runs it is UNVERIFIED.
* **Graceful shutdown.** Next 16.3.8's `start-server.js` handles SIGTERM by closing the listener,
  waiting for in-flight requests and exiting 143 (read from the source, not run). The database pool is
  not closed explicitly. `scripts/shutdown-drill.mjs` proves the drain on Linux, macOS or WSL; it has
  **not been run** (Windows cannot deliver SIGTERM; WSL here has no Node). Render's shutdown delay is
  UNVERIFIED.
* **Exports.** Single-bill and register exports are rate-limited per business (20 per 10 minutes, 200 per
  day), audited (who, filters, row count), never cacheable, capped at 20,000 bills with the truncation
  announced inside the file and in an `X-Export-Truncated` header, and validated (a malformed date is a
  422). Bank details and customer data are printed on bills **by design** (the owner chose it; it is the
  purpose of the document). There is no server-side PDF: printing is the browser's print of an HTML page,
  so there is no PDF service to attack. On Android the file is written to an app-private folder with a
  sanitised name and files older than 7 days are deleted (native change: it only takes effect in a new APK,
  and it could not be compiled here — no JDK or Android SDK on this machine; CI's `android-bundle` job
  builds only the web bundle, so the Gradle compile first happens in the release workflow).
* **Concurrency.** Beyond double-billing, tests fire competing requests for: edit vs edit, edit vs delete,
  delete vs payment, duplicate manual bill numbers, two machine reorders, and freeze vs unfreeze
  (`tests/bills/concurrency-more.test.ts`). The last two were genuine gaps: reordering interleaved and
  freeze/unfreeze audited a stale "before" state; both now serialize on a business-row lock.
* **Dates.** "Today" in forms uses the user's local calendar day (`todayLocal()`), not the UTC day
  — in India (UTC+5:30) the UTC date is still yesterday until 05:30, which used to default new
  bills/payments/readings to the wrong day. Stored instants are UTC; display uses the viewer's
  local time zone.

## 15. Database roles (least privilege) — documented; NOT applied (checked 2026-10-08)

`npm run check:db-role` (read-only) reports what the connection in `DATABASE_URL` can actually do. Run on
2026-10-08 against the database in this environment's `.env`: it connected as the owner role `postgres`, owns
**27 tables**, and can UPDATE, DELETE and TRUNCATE `"AuditLog"` and create objects in the schema, so the
least-privilege role is **not** in use there. Whether the production Render service uses the same credential is
UNVERIFIED. After you create the role below and set it as `DATABASE_URL` in Render, run the same command with
that URL: it must print `least-privilege: yes`.

By default the app connects as the role that created the schema, which can do anything,
including disabling the audit trigger. A runtime role with only the privileges the app needs
removes that. Run as the schema owner, with real names and a generated password (shown here as
placeholders). **This SQL was not executed against Supabase from this repository**; try it on a
scratch/branch database and run the test suite and `npm run audit:integrity` against it first.

```sql
CREATE ROLE excavator_app LOGIN PASSWORD '<generate-a-long-random-password>';
GRANT CONNECT ON DATABASE <dbname> TO excavator_app;
GRANT USAGE ON SCHEMA public TO excavator_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO excavator_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO excavator_app;
REVOKE ALL ON "_prisma_migrations" FROM excavator_app;
-- audit history is append-only for the app at the privilege level too (this also closes the
-- app.allow_audit_purge escape hatch, which only matters to a role that can UPDATE/DELETE):
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM excavator_app;
```

Then in Render: `DATABASE_URL` = the `excavator_app` connection; `MIGRATE_DATABASE_URL` = the
owner connection (used by the `prisma migrate deploy` pre-deploy command through
`prisma.config.ts`). Re-check the privileges after migrations that add tables (default privileges
cover new tables; confirm `AuditLog` still has the REVOKE). Things that will **stop working** for the
app role by design: tenant/user hard-deletes that cascade into audit rows (they need the purge
switch, which the role can no longer use) and any raw DDL. Test cleanup runs against a
non-production database as the owner.

## 16. Assurance and verification

The status words used in this document (AUTOMATED, RUNTIME-VERIFIED, MANUAL, IMPLEMENTED, STATICALLY
IDENTIFIED, UNVERIFIED, DECISION, NOT DONE), the PASS / PARTIAL / FAIL / UNVERIFIED / NOT APPLICABLE
verdicts and the evidence-confidence scale are defined once, in [assurance.md](assurance.md) §1. Most
sections above were written before that vocabulary existed and say "verified" or "tested" in plain words;
read those through the definitions: a plain "verified by hand" is MANUAL, a plain "tested" is AUTOMATED only
if a test file is named, and anything about Render, Supabase, GitHub or production values is UNVERIFIED.
The per-domain ratings, residual risks and open owner decisions live in assurance.md, not here.
