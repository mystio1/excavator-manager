# Assurance statement

What is actually known about this system's security and reliability, how it is
known, and what is **not** known. It exists so a claim can be checked instead of
trusted. It is a living document: when a control changes, change its row.

This is an engineering self-assessment by the people who built the system. It is
not an independent audit, a penetration test, or a compliance certification, and
nothing here is legal advice.

**Scope.** Security, financial integrity and operational reliability of the web API, the web
app and the Android shell. **Product fit, UX and architecture quality are out of scope and are
not rated here**: [architecture.md](architecture.md) describes the structure but this document
does not grade it, and the only UX evidence is a colour-contrast test (D16). A reviewer who
wants those dimensions needs a different instrument.

**Reading guide.** IDs tie the tables together: **D** domain (§2.1), **W** critical workflow
(§2.3), **C** attack chain (§5), **R** consolidated risk (§7.1), **O** open item (§7.2), **F**
fraud case (§8.1), **A** actor (§8.2). Related documents: [operations.md](operations.md)
(degradation, continuity, who can change what, access register),
[configuration.md](configuration.md) (variable register), [scoreboard.md](scoreboard.md) (control counts,
generated), [invariants.md](invariants.md) (data rules), [security.md](security.md), [runbook-recovery.md](runbook-recovery.md).
**Last reviewed against the repository: 2026-10-07.** The files named below were read. On the same day, after the
last change, lint, typecheck, the whole Vitest suite (990 tests in 76 files, against the development database), the
migration scenarios, the web and Android-bundle builds and `npm run check:headers` against a local production
server all passed; CI results on GitHub and every production system are UNVERIFIED.

## Audit result (2026-10-08)

**FINAL AUDIT SCORE: 54.0 / 100** over the 97 points of the external critique, computed by `scripts/audit-score.mjs`
(`Σ(weight × credit) ÷ Σ(weight of applicable points) × 100` = 99.9 ÷ 185; the weights and credits are in that script's
header). The previous score under the same formula was 42.5. The score is **not** a certification and nothing here
was independently audited.

**Production readiness: CONDITIONAL.** The only item the audit treats as a production blocker is **#38: Supabase
provider backup/restore is NOT VERIFIED.** The backup settings (plan, frequency, retention, PITR) could not be read and
no provider restore was performed. The repository's restore drill (`scripts/restore-drill.mjs`, re-run 2026-10-08,
14.5 s, identical) rebuilds our data from a dump into a new schema; it **does not prove that Supabase's backups
work**. The exact manual steps are in [operations.md](operations.md) §2.5b and §12.1 below; nothing in that list has
been performed.

**Owner decisions recorded:** the credential-exposure finding was withdrawn because the owner confirmed no credential
was ever exposed (not verifiable from the repository), and **no credential rotation was performed or is claimed**.
Customer rename behaviour (a renamed customer is intentionally reflected on that customer's historical bills) is
**ACCEPTED BY DESIGN**; no invoice snapshotting will be implemented.

**Not verified by this work:** Render, Supabase, GitHub and CI settings and results, and every production value.
Status words and the verdict scale are defined in §1.

## 1. Vocabulary

### 1.1 Status of a claim

Never write "done" or "secure" without one of these. Words may combine (for example
AUTOMATED + RUNTIME-VERIFIED when CI starts a real server and checks it).

| Status | Meaning |
|---|---|
| **AUTOMATED** | An automated test or CI gate fails if it stops being true. Name the test. |
| **RUNTIME-VERIFIED** | Observed behaving correctly in a running system: a real browser against the production build, a real Postgres, a restore drill. Say what was observed and when. It can still regress unless it is also AUTOMATED. |
| **MANUAL** | Checked by a person by hand once (a review, a build, a one-off script or `curl`). It can silently regress. Say when. |
| **IMPLEMENTED** | A control exists in the code; nothing proves it works end to end. |
| **STATICALLY IDENTIFIED** | Seen in code, schema or configuration only; never observed running. Used for findings: an exposure, a gap or an absent control established by reading. |
| **UNVERIFIED** | Cannot be seen from the repository (a hosting-provider setting, a production value, who has access). |
| **DECISION** | A choice only the owner can make; the trade-off is written down. |
| **NOT DONE** | Known gap, with the reason. |

### 1.2 Verdict: PASS / PARTIAL / FAIL / UNVERIFIED / NOT APPLICABLE

The verdict applies to **one claim, as worded**. There is no overall verdict and no count of
"gates that pass": a count would hide which gate matters. A gap that falls inside the wording of
the claim makes it PARTIAL; a gap about something the claim does not say does not.

| Verdict | Meaning | Status words that map to it |
|---|---|---|
| **PASS** | The claim is enforced by a named test or CI gate and the row names no material gap against its wording | AUTOMATED with no material gap |
| **PARTIAL** | Part of the claim is proven, or something material remains | AUTOMATED with a stated scope gap; RUNTIME-VERIFIED or MANUAL without AUTOMATED; IMPLEMENTED; a STATICALLY IDENTIFIED control; DECISION where a control exists but the owner has not chosen the stronger option |
| **FAIL** | A control the claim depends on is absent, bypassable, or a known fix is still pending | NOT DONE; a STATICALLY IDENTIFIED exposure with no control; an owner action that is overdue |
| **UNVERIFIED** | Depends on something the repository cannot show | UNVERIFIED |
| **NOT APPLICABLE** | The premise does not exist for this product, and the reason is stated | (new) for example SSO/SAML, SCIM, bill e-mail, a PDF service, a multi-person access review |

DECISION and NOT DONE describe the state of a control, not a verdict: the verdict is whatever the
control gives today, and the decision is what could change it.

### 1.3 Evidence quality (the "Conf." and "Ev." columns: status · confidence)

| Conf. | Meaning |
|---|---|
| **H** | An automated test (or a CI step against a running server) exercises it against real handlers, a real database or a real browser and would fail loudly |
| **M** | Exercised at a lower level (unit test, mocked collaborator, configuration assertion), or once by hand, or a plain static fact read from code or config (a setting is present or absent). It can regress silently, or the exercised scope is narrower than the claim |
| **L** | An inference about behaviour nobody has observed, or something that depends on a provider or production value the repository cannot show |

An "Ev." cell is a status word plus a confidence, for example `AUTOMATED · H`. When a row mixes
parts, the weakest part sets the confidence and the cell names the parts. Rough mapping for a
reviewer who uses a six-level scale: CONFIRMED = RUNTIME-VERIFIED, or AUTOMATED · H;
HIGH-CONFIDENCE STATIC = STATICALLY IDENTIFIED · M; STATIC INDICATION = STATICALLY IDENTIFIED · L;
UNVERIFIED = UNVERIFIED; REQUIRES RUNTIME TEST = a STATICALLY IDENTIFIED row whose "what would
reduce it" names the test to write. LIKELY is not used: likelihood is stated in a severity, never
offered as evidence.

### 1.4 Maturity scale

Ordinal, per domain, never averaged or summed. The level describes what the row names in its
Evidence cell; a control the row does not name is not covered by it (see §2.4 for the controls that
do not exist).

| Level | Meaning |
|---|---|
| 0 | Absent |
| 1 | Ad hoc: exists, but no test and no written procedure |
| 2 | Implemented and exercised (a test that is not a CI gate, a hand-run procedure, or only part of the named scope gated). A regression can pass CI unnoticed |
| 3 | **Gated**: an automated test or CI step fails the build if the named scope regresses |
| 4 | Gated **and** observable in production (an alert or dashboard would show it failing) **or** independently verified (someone outside the team tested or audited it) |

**Nothing here is a 4.** There is no production monitoring (D13) and nobody outside the team has
attacked or audited any part of the system. Level 3 deliberately does **not** claim production
observability.

### 1.5 Roles, dates, deadlines, severity

* **Owner** is a role: the business owner/operator, the only person the repository evidences
  ([operations.md](operations.md) §3). No other person is assumed. Where CI or a provider enforces a
  control the Owner is still the accountable role.
* **Last verified**: the last date a person or CI recorded the check passing, as visible from the
  repository. AUTOMATED checks are re-run by every CI run; whether CI is currently green is **not**
  visible here (UNVERIFIED). "None recorded" means no date exists anywhere in the repository.
* **Deadline**: a date or a trigger event. **"—" means the owner has set none; it does not mean the
  item is unneeded.** This document does not invent dates.
* **Severity** (§7): Low, Medium, High, Critical. A qualitative judgement of likelihood and impact for
  this product. No number in this document is a probability unless it is arithmetic from a named constant.

## 2. Maturity by domain

A single overall score would hide the spread, so each domain is rated alone.

### 2.1 Ratings

| ID | Domain | Lvl | Verdict | Evidence (what proves the named scope) | Conf. | Main remaining gap | Risk |
|---|---|---|---|---|---|---|---|
| D1 | Tenant isolation (read **and** write) | 3 | PARTIAL | `tests/security/cross-tenant-matrix.test.ts`: tenant B calls the 43 id-addressed (bracket-path) handlers and the two `detail?id=` reads (45 cases) with tenant A's ids → `404 NOT_FOUND` and A's data unchanged; 14 list/search/dashboard feeds are checked for leaked markers, and the register export workbook has its cells read for leaks. Data-level rules: `tests/integrity/integrity.test.ts`. AUTOMATED | H | No database row-level security (service-layer scoping only). The completeness guard is a **per-route check**: every `[id]` route handler found by the authorization inventory must be imported by the matrix and called by a case, or the test fails naming it (shown by adding a probe route; the old guard was a count with a tolerance of 4). It only sees bracket-path routes and the two `detail?id=` reads that are listed by hand. Outside the matrix altogether: the 7 operator routes (the session mock returns no operator session, `tests/bills/session-mock.ts`) and 7 owner-session GET feeds (`bills/new/direct`, `bills/new/summary`, `layout`, `operators/join-requests`, `settings`, `settings/service-interval`, `site-analysis`), some covered only by service-level isolation tests (for example `tests/tenant-misc/settings.test.ts`) | R2 |
| D2 | Authorization coverage | 3 | PARTIAL | `docs/authorization-matrix.md` is generated from the code; `tests/unit/route-inventory.test.ts` and CI `npm run authz:check` fail when a route/method has no auth guard and is not in the justified `PUBLIC_ROUTES` list (14 route/method pairs). The tenant id comes from the verified session: a static scan fails if any request schema names `businessId` or any handler reads it from the body or query. AUTOMATED | H | The check recognises the three guard helpers; a route that calls one and then ignores its result would pass (review catches that; the matrix test covers the common cases). The scan is a text match, not data-flow analysis | R2 |
| D3 | Authentication & sessions | 3 | PARTIAL | Throttling, enumeration safety, `tokenVersion` revocation checked on **every** request, frozen accounts, sign-out-everywhere, explicit 30-day JWT cap: `tests/auth/login-throttle.test.ts`, `auth-routes.test.ts`, `auth-config.test.ts`, `session-validity.test.ts`. Client SWR cache is cleared on login/logout so one account's data is not shown to the next (`tests/unit/client-cache-isolation.test.ts`). AUTOMATED (service, provider and route level) | M | The real NextAuth `signIn()` path cannot run in Vitest. No MFA for owners (DECISION). Short operator PINs rely on throttling (C10) | R4 |
| D4 | CSRF | 3 | PARTIAL | `tests/unit/csrf.test.ts` (rules) and `tests/security/csrf-exposure.test.ts`: a cross-site `text/plain` post carrying a session cookie is refused `403 CSRF_VALIDATION_FAILED` and writes nothing when sent through the real edge proxy (`src/proxy.ts`); the **same request to the bare handler writes a row**, which shows the proxy is the control; the app's own origin and the Android origin still pass. A real browser run against the production build with a hostile page: blocked, 403, no data created. AUTOMATED (handler and proxy level) + RUNTIME-VERIFIED (browser, post-fix only, once, undated) | M | Origin/Fetch-Metadata only, no token (DECISION, ADR-0004). The pre-fix exposure was never shown in a browser (§6). Only `/api/*` sits behind the proxy; no Server Actions were found in `src/` (a search, not a proof) | R1 |
| D5 | Financial integrity | 3 | PARTIAL | UNIQUE billed-once constraint, row locks, CHECK constraints, idempotency keys, optimistic concurrency, a 50-request concurrent-billing burst (the test pool is 3 connections, so at most 3 run in the database at once; the rest queue, and a timed-out one gets the retryable 503), races between edit, delete, payment and manual bill number checked by outcome not timing (`tests/bills/concurrency-more.test.ts`), exact `NUMERIC`/`Decimal` money, property-based client↔server agreement, `npm run audit:integrity`. Derived money (total, paid, status) cannot be set from a request body (`tests/security/mass-assignment.test.ts`). A removed (archived) customer or bank account cannot be chosen for new bills, work records or approvals, `409 CONFLICT` (`tests/bills/archived-references.test.ts`). AUTOMATED | H | CHECK constraints still `NOT VALID` (enforced for new writes; legacy rows not re-verified; safe to validate, see `docs/invariants.md`). No `audit:integrity` run against production is recorded in the repository. Bills are hard-deleted with an audit snapshot rather than voided (DECISION) | R3 |
| D6 | Audit trail (capture and append-only against the app) | 3 | PARTIAL | Append-only trigger: the database refuses UPDATE and DELETE from an ordinary session (`tests/auth/support-service.test.ts`, "append-only trigger"; the trigger's presence is also an integrity rule). Same-transaction writes that roll back with the change (`tests/bills/audit.test.ts`), actor/before/after/reason/request id, support actions attributed (`tests/auth/support-attribution.test.ts`). The level covers capture and append-only against the application; tamper-evidence is rated 0 in §2.4. AUTOMATED | H | **Not tamper-evident**: anyone who can alter the table's triggers or owns the table can rewrite history; no hash chain, no external copy. See §4 | R7 |
| D7 | Input & resource limits | 3 | PARTIAL | 512 KB default body cap with streamed counting → `413` and transaction-queue timeouts → retryable `503` (`tests/unit/foundation.test.ts`); pagination caps (`tests/bills/routes.test.ts`, `tests/tenant-misc/customers.test.ts`); letterhead image limits (`tests/tenant-misc/letterhead-images.test.ts`, `routes.test.ts`); register export: per-business rate limit, row cap announced in the file, audited (`tests/bills/export-security.test.ts`); `/api/app-version` timeouts and size caps (`tests/unit/app-version-route.test.ts`); the `maxOperators` cap (`tests/operator-join/operator-admin.test.ts`). The 1000-row bill cap on all three create/edit schemas and the `maxBillsPerDay` limit on all three bill-creating routes are gated, including under simultaneous requests (`tests/bills/limits.test.ts`; the limit used to be a count-then-insert race that let 4 bills through a limit of 2, now serialized by a business-row lock). AUTOMATED | M | No per-tenant storage/quota accounting; per-tenant caps are unlimited unless support sets them; no global concurrency limit; hosting limits are UNVERIFIED | R10 |
| D8 | Error contract | 3 | PASS | One body for every error; RFC 9457 members added additively (`type/title/status/detail/instance`); `error` stays a string for installed apps; unexpected errors never leak internals (`tests/unit/foundation.test.ts`). AUTOMATED | H | Media type stays `application/json` on purpose (ADR-0003). An unreachable or saturated database and a pool timeout return a retryable `503` with `Retry-After` and no internals (`tests/unit/foundation.test.ts`); the web client does not retry automatically (O14) | R10 |
| D9 | Secrets & configuration | 2 | PARTIAL | `.env` never in git history (MANUAL, once: `docs/security.md` §12); startup, `/api/health/ready` and the pre-deploy gate `npm run check:config -- --production` (a CI step) validate configuration and print names only (`tests/unit/config-check.test.ts`, `tests/unit/check-config-script.test.ts`, `tests/unit/health-and-headers.test.ts`); `JOIN_CODE_SECRET` separates the join-code key from the session key (`tests/unit/join-code-key.test.ts` proves the HMAC uses the key it claims to); `MIGRATE_DATABASE_URL` allows a least-privilege runtime DB role; `AUTH_SECRET` can be rolled without signing anyone out through `AUTH_SECRET_PREVIOUS` (`tests/auth/auth-secrets.test.ts`, using Auth.js's real JWT code, plus a wiring test in `tests/auth/auth-config.test.ts` that `auth.ts` really passes it on; the `AUTH_SECRET_1..3` route does NOT work with this next-auth version); variable register in [configuration.md](configuration.md). AUTOMATED (validation) / UNVERIFIED (what production actually has) | M | Production values, rotation history and the least-privilege role are not visible from the repo. Credential exposure: the owner confirmed none occurred (in conversation; not verifiable from the repository); see O1. Whether Render runs the config gate before deploy is UNVERIFIED | R6 |
| D10 | Supply chain & CI | 2 | PARTIAL | Actions pinned to SHAs; the CI token is `contents: read` (the release workflow needs `contents: write` to publish); Dependabot, dependency review, CodeQL, `npm audit` gate (critical), CI license gate, SBOM generated in CI and attached to each release. AUTOMATED (in CI); pinning itself is not gated | M | Branch protection, secret scanning, 2FA and "deploy after CI" are settings the repo cannot prove (UNVERIFIED). The release workflow builds from a tag without re-running tests. No build provenance attestation. The audit gate fails only on critical advisories, and one can appear between runs with no code change: `@capacitor/android` 8.5.0 did (GHSA-rvm3-566m-v7fv, remote content at the app origin) and was fixed by upgrading to 8.5.3, which reaches users only in a newly built APK | R9 |
| D11 | Android app | 2 | PARTIAL | `allowBackup=false`, no cleartext (`network_security_config.xml`), SHA-256-verified HTTPS-only updater (`UpdateInstallerPlugin.java`), FileProvider limited to two app-private directories (`file_paths.xml`): read from the source. The static bundle still builds in CI (`android-bundle` job), which does not test these properties. STATICALLY IDENTIFIED + MANUAL (build + review) | M | No MASVS review, no device test of the updater against a hostile server; the updater's SHA-256 check has no executable test | R9 |
| D12 | Observability: instrumentation | 3 | PASS | Structured JSON logs with request ids and redaction of sensitive keys (`tests/unit/foundation.test.ts`); `/api/health` (liveness, no database) and `/api/health/ready` (database within 3 s plus configuration, never prints values) (`tests/unit/health-and-headers.test.ts`). AUTOMATED | H | This is instrumentation only; nothing consumes it (D13). No log retention policy (UNVERIFIED / NOT DONE) | R10 |
| D13 | Observability: production monitoring and alerting | 0 | FAIL | None in the repository: no metrics, no alerting, no error-tracking service, no uptime monitor configured. NOT DONE | M | Whether the hosting provider alerts on anything is UNVERIFIED. An outage is found by users. Cheapest first step: an uptime monitor on `/api/health/ready` (decision 8) | R10 |
| D14 | Availability & recovery | 2 | PARTIAL | Runbook (`docs/runbook-recovery.md`); a scripted logical restore drill (`scripts/restore-drill.mjs`, run by hand, not in CI; **passed 2026-10-05 and again 2026-10-08 (14.5 s end to end) against the development database, tiny dataset**: RUNTIME-VERIFIED); migration-safety tests (CI, `npm run test:migrations`); degradation behaviour and business-continuity fallbacks read from code in [operations.md](operations.md) §1–§2 (STATICALLY IDENTIFIED, not failure-injected). AUTOMATED (migrations) / RUNTIME-VERIFIED (drill) | M | Provider backup/PITR restore never tested (UNVERIFIED). No RPO/RTO agreed (DECISION; the runbook proposes RTO ≤ 2 h, RPO ≤ 24 h to confirm). Graceful shutdown on deploy: read from Next's code, drill script written but never run (O10) | R8, R10 |
| D15 | Support console | 3 | PARTIAL | Separate DB-backed sessions (hashed token, 1 h absolute expiry, revocable), strict throttling, **written reason required** for impersonate/freeze/limits/clear-data (for impersonation it is enforced where the audit entry is written, so the Auth.js callback route cannot bypass the route schema) and stored in the business's audit log, impersonation attributed as SUPPORT: `tests/auth/support-routes.test.ts`, `support-sessions.test.ts`, `support-service.test.ts`, `support-attribution.test.ts`. AUTOMATED | M | One shared password, no MFA, no idle timeout, no per-person identity, no break-glass procedure (rated 0 in §2.4). See §3 | R5 |
| D16 | Testing & quality | 3 | PARTIAL | Typecheck (app and tests) + ESLint + Vitest against real Postgres + migration scenarios + a colour-contrast test (`tests/a11y`) + `authz:check` + the security headers checked on a running production server (`scripts/check-headers.mjs`), all in CI (`.github/workflows/ci.yml`). Every integrity rule (the data rules, the database controls and the orphan scan) is proven to FAIL on an injected corruption or a removed control, and the command-line wrapper's exit codes and JSON output are tested (`tests/integrity/integrity.test.ts`, `integrity-extra.test.ts`; controls are removed inside a rolled-back transaction, so nothing persists). The money property test (`tests/unit/money-property.test.ts`) was mutation-checked **once, by hand**: that claim is recorded in `docs/invariants.md` but cannot be reproduced from the repo (UNVERIFIED). AUTOMATED | M | No automated accessibility scan of rendered pages (an axe run by hand, if any, left no record: UNVERIFIED), no visual-regression or Android end-to-end suite, no load test, no mutation-testing tool, **no coverage tool** (§2.3 says why). | R2, R3 |

### 2.2 Control owner, verification method and necessity

"Owner" is the role defined in §1.5. "Necessity now" uses the §10 vocabulary: Critical, Necessary,
Soon, Future (with its trigger), Not justified. Test commands that touch the database need
`TEST_DATABASE_URL` (CI provides a Postgres service); `npm test -- <path>` runs one file.

| ID | Control owner | How to re-verify (command, test or manual procedure) | Last verified | Necessity now |
|---|---|---|---|---|
| D1 | Owner (CI enforces) | `npm test -- tests/security/cross-tenant-matrix.test.ts`; `npm run audit:integrity` for the data-level rules | CI each run; test files read 2026-10-07; audit:integrity on production: none recorded | Critical |
| D2 | Owner (CI enforces) | `npm run authz:check`; `npm test -- tests/unit/route-inventory.test.ts` | CI each run; read 2026-10-07 | Critical |
| D3 | Owner (CI enforces) | `npm test -- tests/auth`; manual: sign in on a device, then "Sign out everywhere" and confirm a second device is signed out | CI each run; manual procedure: none recorded | Necessary |
| D4 | Owner (CI enforces) | `npm test -- tests/unit/csrf.test.ts tests/security/csrf-exposure.test.ts`; manual: a hostile cross-origin form page against a production build (the procedure is not stored in the repo) | CI each run; browser run: UNVERIFIED (once, undated) | Necessary (the cookie is `SameSite=None`) |
| D5 | Owner (CI enforces) | `npm test -- tests/bills tests/unit/money-property.test.ts`; weekly `npm run audit:integrity` against production (read-only) | CI each run; production audit: none recorded | Critical |
| D6 | Owner (CI enforces) | `npm test -- tests/bills/audit.test.ts tests/auth/support-service.test.ts` | CI each run; read 2026-10-07 | Necessary (tamper-evidence: Future, §2.4) |
| D7 | Owner (CI enforces) | `npm test -- tests/unit/foundation.test.ts tests/bills/export-security.test.ts tests/unit/app-version-route.test.ts` | CI each run; read 2026-10-07 | Necessary |
| D8 | Owner (CI enforces) | `npm test -- tests/unit/foundation.test.ts` | CI each run; read 2026-10-07 | Necessary |
| D9 | Owner | `npm run check:config -- --production` (CI runs it with the CI environment, **not** production values); manual: compare the Render environment with [configuration.md](configuration.md) | CI each run (CI values only); production values: UNVERIFIED | Critical |
| D10 | Owner | CI workflows; manual: GitHub Settings (branch protection, secret scanning, 2FA, collaborators) | CI each run; settings: UNVERIFIED | Necessary, proportionate |
| D11 | Owner | `npm run build:android` (CI builds the bundle); manual review of the manifest and updater; device test: none exists | Build: CI each run; review: undated | Necessary (an auto-updater reaches every device) |
| D12 | Owner (CI enforces) | `npm test -- tests/unit/health-and-headers.test.ts`; `npm run check:headers -- <url>` (CI runs it against a local production server; run it against the live URL after a deploy) | CI each run; live URL: none recorded | Necessary |
| D13 | Owner | Not applicable until a monitor exists; then: confirm it alerts when `/api/health/ready` is down | none (absent) | Soon |
| D14 | Owner | `node scripts/restore-drill.mjs`; `npm run test:migrations`; provider restore per `docs/runbook-recovery.md` §5 | Logical drill 2026-10-05 (development database, tiny dataset); provider restore: never | Necessary |
| D15 | Owner (CI enforces) | `npm test -- tests/auth/support-routes.test.ts tests/auth/support-sessions.test.ts tests/auth/support-service.test.ts tests/auth/support-attribution.test.ts`; manual: confirm `SUPPORT_ACCESS_PASSWORD` is unset in Render when the console is not in use | CI each run; production setting: UNVERIFIED | Necessary while enabled; approvals and MFA: Future |
| D16 | Owner (CI enforces) | `npm run check` (lint, typecheck, prisma validate, tests) and the CI workflow | CI each run | Necessary |

### 2.3 Critical workflows and what proves them

This is a register of **named invariants and boundaries with their tests**, not a coverage report.
**No coverage tool is used**: `vitest.config.ts` has no coverage block and `package.json` has no
coverage script or package. That is intentional for the goal this document sets: *every critical
business invariant and security boundary has an executable regression test that fails if it breaks*.
A line-coverage percentage rewards running code, not asserting rules; a double-billing race or a
missing tenant filter can sit inside 100 % covered code. A coverage report could later help find
untested files, as supporting evidence and never as the target. Test files were read for this
review, not run.

| ID | Workflow | Boundary or invariant | Proven by | Not proven |
|---|---|---|---|---|
| W1 | Create a bill (work-based, summary, direct) | Exact totals; a work record is billed once; a retry cannot double-create; bill numbers; a removed customer or bank account is refused | `tests/bills/totals.test.ts`, `double-billing.test.ts` (50 concurrent), `idempotency.test.ts`, `routes.test.ts`, `audit.test.ts`, `archived-references.test.ts`; `tests/unit/money-property.test.ts`; `tests/bills-ui/bill-math.test.ts` (client maths) | GST rules beyond arithmetic ([invariants.md](invariants.md)); summary bills are not tied to work records (by design) |
| W2 | Record a payment | Cannot exceed the balance or be ≤ 0; status derived from payments; concurrent payments cannot overspend; replay-safe | `tests/bills/payments.test.ts` (status transitions, update, concurrent), `idempotency.test.ts` (payments), `routes.test.ts` (payments over HTTP), `tests/security/mass-assignment.test.ts` | Bank reconciliation does not exist; legacy rows are not covered by the `NOT VALID` CHECK constraints |
| W3 | Edit (bill, payment, work record, reading) | Stale edits refused (`expectedVersion`); a total cannot drop below what is paid; server-owned fields in the body are ignored; every edit audited | `tests/bills/update-delete.test.ts`, `payments.test.ts`, `concurrency-more.test.ts` (edit vs edit, edit vs delete), `tests/fleet/work-sessions.test.ts`, `daily-logs.test.ts`, `concurrency.test.ts`, `tests/security/mass-assignment.test.ts` (10 cases on 10 handlers), `tests/bills/audit.test.ts` | Edits by a malicious owner are allowed by design and detected only after the fact; mass-assignment cases do not cover every mutating route |
| W4 | Delete (bill, payment, work record, reading, operator money entry) | A deleted bill is kept whole as the audit `before`; deletes are audited and tenant-scoped | `tests/bills/update-delete.test.ts` (`deleteBill`), `audit.test.ts` (`bill.delete`), `concurrency-more.test.ts` (delete vs payment leaves no orphan), `tests/fleet/work-sessions.test.ts`, `daily-logs.test.ts`, `tests/operator-money/transactions.test.ts` | No void or credit note (DECISION, O3); audit rows are not tamper-evident (§4) |
| W5 | Operator reading approval | Operator entries stay PENDING until the owner approves; an operator reaches only the machine paired with them and their own requests; of two simultaneous approvals one wins | `tests/operator-money/work-requests.test.ts`, `work-requests-route.test.ts`, `tests/fleet/daily-logs.test.ts` (operator submission, approval, rejection) | Statistical detection of odd readings (NOT DONE); the operator routes are outside the cross-tenant matrix |
| W6 | Login and sessions | Throttled; no account enumeration; revoked by password change, sign-out-everywhere, operator disable/archive; a frozen business gets 423; the client cache is cleared between accounts | `tests/auth/login-throttle.test.ts`, `auth-routes.test.ts`, `auth-config.test.ts`, `session-validity.test.ts`, `signin-response.test.ts`, `support-routes.test.ts`; `tests/unit/client-cache-isolation.test.ts` | The real NextAuth `signIn()` and cookie round trip (cannot run in Vitest); owner MFA does not exist |
| W7 | Cross-tenant access | Tenant B gets 404 for tenant A's ids and A's data is unchanged; lists never leak; rows never point across tenants | `tests/security/cross-tenant-matrix.test.ts`, `tests/bills/tenant-isolation.test.ts`, `tests/fleet/tenant-isolation.test.ts`, `tests/tenant-misc/customers.test.ts`, `settings.test.ts`, `tests/operator-join/approve-join.test.ts`, `tests/integrity/integrity.test.ts` | A new bracket-path handler cannot slip in (per-route guard); 7 operator routes and 7 owner GET feeds are not in the matrix; no row-level security |
| W8 | Export (single bill, register, print) | Formulas stored as text; hostile text escaped in the print view; never cacheable; row cap announced in the file; audited; per-business rate limit | `tests/bills/excel.test.ts`, `tests/bills/export-security.test.ts`, `tests/security/cross-tenant-matrix.test.ts` (`GET bill export`) | The Android download/share path (native plugin) has no test; what other tools do with the file |
| W9 | Removed customer or bank account | Cannot be chosen for new bills, work starts or approvals; existing records stay editable so history is not stranded; completed work for a since-removed customer can still be billed | `tests/bills/archived-references.test.ts` | Enforced at write time only; not a data-level integrity rule |
| W10 | App update feed | The release lookup cannot be steered to another host (SSRF); every outbound call has a timeout and a size cap; a bad payload is refused | `tests/unit/app-version-route.test.ts` (real handler, mocked `fetch`), `tests/unit/app-version-url.test.ts`, `tests/tenant-misc/routes.test.ts` | The Android SHA-256 verification has no executable test; trust in the GitHub release itself (R9) |
| W11 | Health and response headers | Liveness touches no database; readiness never prints a value; HSTS, CSP, framing, sniffing and referrer headers set; the API is never cacheable | `tests/unit/health-and-headers.test.ts` (configuration); `scripts/check-headers.mjs` run by CI against `next start` (running server) | The live Render edge after a deploy: no run recorded |

### 2.4 Controls that do not exist (rated 0 or 1, so a 3 elsewhere is not read as covering them)

| Control | Level | Risk | Necessity now (enterprise importance in §10) |
|---|---|---|---|
| Production monitoring and alerting (D13) | 0 | R10 | Soon: one uptime monitor is cheap (decision 8) |
| Audit tamper-evidence (hash chain or an off-database copy) | 0 | R7 | Future: needed once a second person can reach the database |
| Least-privilege database role | 1 (SQL documented in `docs/security.md` §15; not applied, not tested) | R6, R7 | Worth doing now; it also closes the audit-purge escape hatch from the app |
| Owner MFA | 0 | R4 | Future: when a second user exists or the customer count grows (DECISION) |
| Support console: MFA, per-person identity, second approver, alert on use | 0 | R5 | Future: necessary the moment a second person gets the password |
| Database row-level security | 0 | R2 | Worth doing after DB roles |
| Build provenance attestation; tests re-run on a tag; an approval gate on release | 0 | R9 | Medium: cheap relative to the blast radius of a bad release |
| Accessibility scan, visual regression, Android end-to-end, load test, mutation-testing tool, coverage tool | 0 | (quality) | Not justified yet, except an accessibility scan if screens change often |
| SSO/SAML, SCIM | NOT APPLICABLE | none | Not needed today (§10) |

## 3. Support console as a separate trust domain

Treat it as the most powerful door in the system: it can read every tenant and
freeze or wipe business data. Evidence for the controls in place: AUTOMATED · M
(`tests/auth/support-routes.test.ts`, `support-sessions.test.ts`, `support-service.test.ts`,
`support-attribution.test.ts`); the list of what is not in place is NOT DONE.

* **In place:** disabled unless `SUPPORT_ACCESS_PASSWORD` is set; 3 attempts / 15 min / IP and
  30 failed / day platform-wide; opaque random token, only its hash stored; 1-hour
  absolute lifetime; revocable; every action and every edit made *while impersonating*
  is written to the target business's audit log with the support session id; a written
  reason (≥ 5 characters) is required and stored; Clear Data re-checks the typed business code
  on the server.
* **Not in place:** MFA; per-person accounts (the audit trail says "support session X", not
  a person); idle timeout; approval by a second person for destructive actions; alerting
  when the console is used; network restriction. With a single owner-operator these are
  proportionate omissions today and **necessary** the moment a second person gets the
  password. **DECISION:** keep it disabled (unset the variable) except when needed, and use a long
  random password (the startup log warns below 12 characters). Whether the variable is set in
  production, and who holds it, is UNVERIFIED ([operations.md](operations.md) §3, §4.1).

## 4. Audit-log tamper resistance — what the trigger does and does not do

The trigger stops the *application* (and any ordinary SQL session) from updating,
deleting or truncating audit rows (AUTOMATED · H for the ordinary-session case,
`tests/auth/support-service.test.ts`). It does **not** stop (STATICALLY IDENTIFIED · M: the bypasses
were read from the trigger design and never exercised):

* the table owner or a superuser (they can `ALTER TABLE … DISABLE TRIGGER`, or
  `SELECT set_config('app.allow_audit_purge','on', …)` and delete);
* anyone holding the application's own database credential **if that role owns the table or
  has UPDATE/DELETE on it** — and today the app connects as the schema owner (UNVERIFIED for
  production, but that is how a default Supabase/Prisma setup works).

Realistic mitigations, in order of cost: (1) run the app as a **non-owner role** without
UPDATE/DELETE/TRUNCATE on `"AuditLog"` (SQL in `docs/security.md` §15, UNVERIFIED against
Supabase) — this also closes the `app.allow_audit_purge` escape hatch from the app; (2)
periodically export audit rows somewhere the database admin cannot rewrite; (3) a hash
chain over rows. The audit log is therefore *tamper-resistant against application bugs and
casual misuse*, not *tamper-evident against a privileged insider*. Direct SQL is not in the
in-app audit at all ([operations.md](operations.md) §3, "Database schema / migrations").

## 5. Compound attack chains

Single controls look fine; the risk is in combinations. A chain is **reasoning**, never an exploit
run: no chain below was executed end to end. The Ev. column rates the evidence for the mitigations,
not for the chain.

| ID | Chain | Why it matters | What stops or limits it today | Gap | Ev. |
|---|---|---|---|---|---|
| C1 | Phone is lost or stolen → open app → owner session valid for up to 30 days | An owner session can issue and delete bills and read all customer data | Optional app-lock PIN (5 tries / 5 min, 20 / day, one shared budget across every PIN check); **Sign out everywhere** (Settings) revokes every session at once; password change revokes too; per-request DB check (`tests/auth/session-validity.test.ts`) | App lock is optional; no remote device list | AUTOMATED · M |
| C2 | Database URL leaks (hypothetical; the owner states none has) → direct SQL | Bypasses every application control, can disable the audit trigger | Least-privilege runtime role (documented, not applied); rotate if a leak is ever suspected | If a leak is suspected, treat the data as exposed until the credential is replaced | UNVERIFIED · L (the role in use is not visible) |
| C3 | Support password guessed or reused → impersonate any business | Full read/write on any tenant as its owner | Strict throttling; 1 h sessions; reason + audit; console disabled by default | Single shared secret, no MFA, no alert | AUTOMATED · M |
| C4 | Operator forges a join request for a real operator's number | Gains operator access to a business | Business-code rate limits, admin must type the one-time code the real operator read out, 5-try lock (`tests/operator-join/approve-join.test.ts`), 7-day expiry | Admin social-engineering is outside code | AUTOMATED · M |
| C5 | Malicious customer/site name or note ("`=HYPERLINK(...)`") → exported spreadsheet → accountant's machine | Formula injection | Exports are `.xlsx` written as text cells, never formulas — proven by a test that re-reads the real file (`tests/bills/excel.test.ts`). No CSV export exists | A user who pastes cells into another tool is outside the app | AUTOMATED · H |
| C6 | Compromised GitHub account or `v*` tag → signed APK containing attacker code → auto-update | Every installed device runs it | The updater accepts only HTTPS GitHub assets and checks a SHA-256, and Android installs an update only if it is signed with the app's own key (platform behaviour; a rotated key is a new app identity, runbook scenario F); that stops a swapped asset or a hostile mirror. It does **not** stop someone who can push a tag: the workflow then builds, signs and publishes a matching hash itself. Pinned Actions; keystore in a secret | Branch protection and 2FA are UNVERIFIED; no build provenance; tag builds skip tests; no `environment:` approval gate ([operations.md](operations.md) §3) | STATICALLY IDENTIFIED · L; GitHub settings UNVERIFIED |
| C7 | XSS despite CSP (`script-src 'unsafe-inline'`) → API calls with the session cookie | The cookie is `SameSite=None` so the browser attaches it to the app's own requests | HttpOnly session cookie (Auth.js default), same-origin CSP, no third-party scripts; hostile text is escaped in the print view (`tests/bills/export-security.test.ts`); CSP configuration asserted (`tests/unit/health-and-headers.test.ts`) | `unsafe-inline` weakens the CSP; a nonce policy is a recorded follow-up | AUTOMATED (config) · M; the weakness is STATICALLY IDENTIFIED |
| C8 | **Cross-tenant data access:** a route missing from the isolation matrix → id probing → support impersonation | Reads or edits another business's bills, customers and operator data. Steps: (1) a new id-addressed handler ships whose service forgets the `businessId` filter; (2) a new bracket-path handler is caught by the per-route guard, but operator routes, 7 owner GET feeds and any route whose id arrives in a query string or body sit outside it; (3) a second tenant (registration is open, rate-limited per IP) probes ids taken from its own pages or from leaked links; (4) alternatively support impersonation reads any tenant on purpose | The tenant id comes from the session only (static scan, `tests/unit/route-inventory.test.ts`); every service filters by `businessId`; 43 id handlers + 14 feeds + the register export answer 404 and leak nothing (`tests/security/cross-tenant-matrix.test.ts`); ids are `cuid()`s but nothing relies on them being unguessable; data-level integrity rules flag cross-tenant pointers after the fact (`npm run audit:integrity`); impersonation needs a reason and is attributed SUPPORT | No row-level security, so one missed filter is a leak; the guard sees only bracket-path routes; operator routes and 7 owner GET feeds sit outside the matrix; support access is a deliberate cross-tenant reader (C3) | AUTOMATED · H for covered handlers; the uncovered scope is STATICALLY IDENTIFIED · M |
| C9 | **Financial manipulation:** compromised owner session or database access → edit or delete bills and payments → rewrite history if the audit trigger is bypassed | Falsified revenue, receivables or paid status with no trace | An owner session can edit and delete by design (the owner asked for full editability) but each change writes an audit row with before/after, actor and optional reason; optimistic concurrency; a payment cannot exceed the balance; a deleted bill is kept whole in the audit `before`; sign-out-everywhere; the trigger refuses UPDATE/DELETE from an ordinary SQL session; `npm run audit:integrity` flags *inconsistent* money | With the database credential (app connects as owner: UNVERIFIED) the trigger can be disabled and data and audit rewritten **consistently**, which the integrity checks cannot see (they check consistency, not truth); no alert on bulk edits or deletes; no void/credit-note; nothing external holds a copy | AUTOMATED · H (audit on edit/delete, trigger against ordinary sessions); the bypass is STATICALLY IDENTIFIED · M |
| C10 | Operator PIN guessing (known mobile number, 4-digit PIN) → operator session | An operator session can submit readings and start/end work requests for the paired machine, and cannot read bills or customers | Per-mobile limit of 5 wrong guesses / 15 min and 20 / day, even from different IPs (`tests/auth/login-throttle.test.ts`); wrong PIN, unknown mobile and login-disabled look identical; every reading is PENDING until the owner approves; disable/archive revokes at once | Arithmetic from the constants in `src/lib/auth-throttle.ts`: 20 guesses a day against 10,000 four-digit PINs is about 0.2 % a day for a random PIN, about 6 % over 30 days of sustained guessing; no alert on repeated failures. New PINs are 4–8 digits, but 4 is allowed | AUTOMATED (throttle) · M; the arithmetic is derived, not measured |

## 6. Evidence labels worth calling out

| Topic | Shown, and how | Not shown | Status · conf. |
|---|---|---|---|
| CSRF fix | A hostile cross-origin form page, in a real browser, against the protected production build, was refused with 403 and created nothing. Through the real proxy the same request is refused in `tests/security/csrf-exposure.test.ts` | The page was not run against the vulnerable build: the attempt to switch the check off for a before/after comparison was (correctly) refused by the environment's safety controls and was not circumvented | RUNTIME-VERIFIED (post-fix, once, undated) + AUTOMATED (proxy level) · M |
| CSRF pre-fix exposure | `tests/security/csrf-exposure.test.ts`, EXPOSURE case: the real `POST /api/customers` handler, called on its own with a cross-site `text/plain` body, an `Origin: https://evil.example` header and a session-cookie header, answers 200 and writes a row. Nothing was disabled to show it | In a browser. That a browser attaches the `SameSite=None` cookie to a cross-site form post is read from the cookie configuration (`src/lib/auth.ts`) and ADR-0004. The test supplies the session through its mock, so the cookie value itself is not validated | AUTOMATED (handler level) · M; browser level STATICALLY IDENTIFIED · M |
| Security headers / CSP | Configuration asserted by `tests/unit/health-and-headers.test.ts`; CI starts `next start` and runs `npm run check:headers` (`.github/workflows/ci.yml`); production build, real browser, eight screens, no violations (once, MANUAL) | The live Render edge: `npm run check:headers -- <live URL>` after a deploy has no recorded run. The CSP still allows inline scripts (C7) | AUTOMATED + RUNTIME-VERIFIED (local server) · H; live edge UNVERIFIED · L |
| Mass assignment | `tests/security/mass-assignment.test.ts`: 10 cases on real handlers (customers, operators, machines, profile, work sessions, bills, payments) send a valid body plus server-owned fields (tenant, id, timestamps, version, archive flag, totals, paid, status, letterhead, `canLogin`, `pinHash`, `tokenVersion`, frozen/limits/code) and re-read the row. A static guard in `tests/unit/route-inventory.test.ts` fails if a non-support request schema names any of 12 server-owned fields | Schemas strip unknown keys rather than reject them (not `.strict()`), so a forbidden field is silently dropped, not a 422. The behavioural cases cover 10 handlers, not every mutating route. The static guard is a word match over `src/lib/validation` (support schemas excluded) and cannot see fields built elsewhere | AUTOMATED · M |
| Client cache between accounts | `tests/unit/client-cache-isolation.test.ts`: the clear-cache hook drops every SWR entry without refetching; five sign-in/sign-out files must call it before navigating; the two hard-navigation flows must still reload | Behaviour in a real browser or WebView; the per-file checks assert source text, not how each page behaves | AUTOMATED · M |
| App-version feed | `tests/unit/app-version-route.test.ts` drives the real handler with a mocked `fetch`: poisoned asset URLs (internal address, another host, another repository, plain http) → 502 and no second request; a timeout signal on every outbound call; oversized payloads (declared and streamed) → 502; schema violations → 502. The route has 8 s timeouts and 1 MB / 64 KB caps | Real GitHub behaviour, redirects and Render's outbound network | AUTOMATED · H (mocked network) |
| Everything about Render, Supabase, GitHub settings and production environment values | Nothing: they are not in the repository ([operations.md](operations.md) marks each cell) | Everything | UNVERIFIED · L |

## 7. Residual risk register

Severity is **Low, Medium, High or Critical**: a qualitative judgement of likelihood and impact
for this product, never computed. "Before controls" is reasoning about the system as if the control
were absent; the one case where the before state was exercised is CSRF, at handler level (§6).

### 7.1 Consolidated risk table

| ID | Risk | Severity before controls | Control in place | Severity after | Remaining uncertainty | What would reduce it | Ev. |
|---|---|---|---|---|---|---|---|
| R1 | CSRF: a hostile page makes the browser send state-changing requests with the victim's cookie | High: the cookie is `SameSite=None` and handlers accept any content type; a cross-site form post wrote a row at handler level | Origin and `Sec-Fetch-Site` check in `src/proxy.ts` for every state-changing `/api/*` request (`src/lib/csrf.ts`, ADR-0004) | Low | No token, so the one check is the only barrier and a bug in it matters more; a request with neither header and no session cookie passes by design; the before state was never shown in a browser; only `/api/*` is covered | A CSRF token (DECISION, ADR-0004); a scripted hostile-page browser check kept in the repo and run after any change to `proxy.ts` | AUTOMATED · M; browser RUNTIME-VERIFIED once |
| R2 | Cross-tenant access: one business reads or changes another's data | Critical: every query is a possible leak | Tenant id from the session only; every service filters by `businessId`; authz inventory in CI; cross-tenant matrix; data-level integrity rules; 404 for foreign ids | Low–Medium | No row-level security; the matrix guard is per-route for bracket-path handlers; 7 operator routes and 7 owner GET feeds are outside it; open registration means a second tenant can exist at any time | Operator sessions in the test harness and the 7 owner feeds in the matrix; a non-owner DB role, then row-level security | AUTOMATED · H (covered scope); gaps STATICALLY IDENTIFIED · M |
| R3 | Double billing, mis-posted payments and money errors | High: concurrent requests, retries and rounding can double-bill or drift | UNIQUE `BillItem.workSessionId`, row locks, idempotency keys (48 h), optimistic concurrency, CHECK constraints, exact decimals, a 50-request race test, property test, weekly `audit:integrity` | Low | CHECK constraints are `NOT VALID` (legacy rows unverified); summary bills are hand-typed and not tied to work records (owner-trust boundary); old Android apps send no idempotency key; no production `audit:integrity` run is recorded | Validate the CHECK constraints after an `audit:integrity` run on production; record weekly runs; retire old apps by forced update | AUTOMATED · H |
| R4 | Session theft or account takeover (lost phone, stolen cookie, credential or PIN guessing) | High | HttpOnly cookie; 30-day cap; `tokenVersion` checked on every request; password change, reset and sign-out-everywhere revoke; login throttling without enumeration; optional app-lock PIN; frozen accounts | Medium | Owner MFA does not exist (DECISION); the real NextAuth sign-in path is untested; short operator PINs rest on throttling (C10); no device list | Owner MFA; shorter sessions or a device list; make the app lock mandatory | AUTOMATED · M |
| R5 | Support-console abuse: the password holder reads, freezes, wipes or impersonates any tenant | Critical | Off unless `SUPPORT_ACCESS_PASSWORD` is set; strict throttle; DB-backed 1 h revocable sessions; hashed token; written reason; SUPPORT attribution in the tenant's audit log | Medium while the console is off; High while it is on | One shared password, no MFA, no per-person identity, no idle timeout, no alert on use; whether the variable is set and how strong it is in production is UNVERIFIED | Keep it unset by default; a long random password; per-person accounts, MFA and a second approver once another person has access; an alert on use | AUTOMATED · M; production UNVERIFIED |
| R6 | Secret leakage (database URL, session secret, mail key, signing keystore) | High | `.env` never in git history; names-only config validation; log and error redaction; readiness never prints values; separate `JOIN_CODE_SECRET` | Low–Medium | The owner states no credential was exposed (not verifiable here); where production secrets live and who can read them is UNVERIFIED; no rotation log; secret scanning UNVERIFIED | The least-privilege DB role; GitHub secret scanning; a rotation log ([operations.md](operations.md) §2.4, §3) | UNVERIFIED · L (production); AUTOMATED · M (validation, redaction) |
| R7 | Audit tampering: history rewritten by someone with database access | High | Append-only trigger against ordinary sessions; same-transaction writes; attribution; a documented non-owner role (not applied) | Medium | The app connects as the schema owner (UNVERIFIED for production); no hash chain or external copy; direct SQL is outside the in-app audit; the trigger can be disabled by an owner or superuser | Apply the non-owner role (`docs/security.md` §15); export audit rows off the database on a schedule; a hash chain | AUTOMATED · H (ordinary sessions); bypass STATICALLY IDENTIFIED · M |
| R8 | Data loss (bad deploy, deleted data, provider failure) | High | Provider backups/PITR (plan UNVERIFIED); `docs/runbook-recovery.md`; a logical restore drill (2026-10-05, tiny dataset); migration-safety tests; destructive actions audited with a snapshot | Medium | Provider backup and PITR restore never tested; no RPO/RTO agreed; no scheduled export, so no recent copy outside the system ([operations.md](operations.md) §2.1); bills are hard-deleted (DECISION) | Do the provider restore test once (runbook §5); agree RPO/RTO; a scheduled register export; decide void versus delete | RUNTIME-VERIFIED (logical drill) · M; provider side UNVERIFIED · L |
| R9 | Supply-chain or release compromise (a bad dependency, tag or workflow reaches every device) | High | SHA-pinned Actions; Dependabot; dependency review; CodeQL; critical-advisory gate; license gate; SBOM; HTTPS-only SHA-256 and same-key updater | Medium | Branch protection, secret scanning and 2FA UNVERIFIED; tag builds skip tests; no provenance; whoever can push a tag gets a correctly signed APK (C6); the audit gate ignores non-critical advisories | Protect `v*` tags and require CI success plus an approval `environment:`; a provenance attestation; 2FA on every account | AUTOMATED (CI gates) · M; GitHub settings UNVERIFIED · L |
| R10 | Availability: the service is down or degraded and nobody notices | Medium | Liveness and readiness endpoints; idempotent retries; transaction timeouts and an unreachable database → retryable 503; stateless process; pre-deploy migrations keep the previous release serving if they fail | Medium | Nothing watches `/api/health/ready`; Render plan, spin-down and SIGTERM handling UNVERIFIED; the client does not retry a 503 automatically; no SLO | An uptime monitor (decision 8); map connection errors to 503 with a client retry; an SLO once monitoring exists | STATICALLY IDENTIFIED · L (degradation read from code, not failure-injected); health routes AUTOMATED · M |

### 7.2 Open items

Rating is likelihood · impact. Deadline "—" means the owner has set none (§1.5).

| ID | Item | Rating | Status | Risk | Ev. | Owner | Deadline |
|---|---|---|---|---|---|---|---|
| O1 | Credential exposure reported earlier | n/a | **ACCEPTED / NOT APPLICABLE:** the owner confirmed that no credential was ever exposed. The earlier "rotate now" finding is withdrawn. **No rotation was performed and none is claimed.** If a leak is ever suspected, `docs/configuration.md` §8 and `docs/runbook-recovery.md` scenario F say how to replace a secret | R6 | The owner's statement only; not verifiable from the repository | Owner | — |
| O2 | App connects as the schema owner (audit trigger bypassable with the app's own credential) | Low · High | **Confirmed for the database in the development `.env`** by `npm run check:db-role` on 2026-10-08: role `postgres`, owns 27 tables, can UPDATE/DELETE/TRUNCATE `"AuditLog"`. Production credential: UNVERIFIED. Fix is the owner's: create the role in `docs/security.md` §15 and re-run the checker with it | R7 | RUNTIME-VERIFIED (development DB) · M; production UNVERIFIED | Owner | — |
| O3 | Hard-deleting bills (audit snapshot kept) rather than voiding/credit-noting | Medium · Medium (GST: invoices are normally cancelled/credit-noted, not erased; the rule itself is UNVERIFIED here) | DECISION; **ask an accountant** | R7 | AUTOMATED · H (behaviour, `tests/bills/update-delete.test.ts`); the legal point UNVERIFIED | Owner | — |
| O4 | Owner login has no MFA | Low–Medium · High | DECISION | R4 | STATICALLY IDENTIFIED · M | Owner | Trigger: a second person gets access, or now |
| O5 | Provider backups never restored (**production blocker**; audit point 38) | Low · Very high | NOT VERIFIED and NOT PERFORMED: the Supabase backup/PITR settings cannot be read from here. Verified instead: our own logical rebuild-from-dump, re-run 2026-10-08, 14.5 s, identical (development DB, tiny dataset: [operations.md](operations.md) §2.5b). Exact manual steps are in §2.5b and §12.1 | R8 | RUNTIME-VERIFIED (logical drill only) · M; provider side UNVERIFIED · L | Owner | Before relying on the service |
| O6 | No alerting or metrics (an outage is found by users) | Medium · Medium | NOT DONE; point an uptime monitor at `/api/health/ready` | R10 | STATICALLY IDENTIFIED · M | Owner | — |
| O7 | Old installed Android apps send no idempotency key / version | Medium · Low–Medium | Retired by a forced update | R3 | STATICALLY IDENTIFIED · M | Owner | — |
| O8 | CSP allows inline scripts | Low · Medium | Follow-up (nonce policy) | R1 | STATICALLY IDENTIFIED · M | Owner | — |
| O9 | Tag-triggered release skips the test suite | Low · High | Release only commits that passed CI; consider requiring CI success in the workflow | R9 | STATICALLY IDENTIFIED · M | Owner | — |
| O10 | Graceful shutdown on Render's SIGTERM at deploy | Low · Low–Medium (idempotency keys make a client retry safe) | STATICALLY IDENTIFIED: Next 16.3.8 (`node_modules/next/dist/server/lib/start-server.js`) closes the listener, waits for in-flight requests, then exits 143 (read, not run). `scripts/shutdown-drill.mjs` would prove it on Linux, macOS or WSL but has **not been run** (this machine is Windows and WSL has no Node). The database pool is not closed explicitly. Render's start command and shutdown delay: UNVERIFIED | R10 | STATICALLY IDENTIFIED · M; Render UNVERIFIED · L | Owner | — |
| O11 | No offline mode / poor-network behaviour beyond safe retries (idempotency key + `expectedVersion`) | Medium · Low | By design; the app needs a connection | R10 | STATICALLY IDENTIFIED · M | Owner | — |
| O12 | Isolation matrix gaps: 7 operator routes and 7 owner GET feeds outside it (the per-route completeness guard now covers bracket-path handlers) | Low–Medium · High | NOT DONE; make the guard a per-route check and give the harness operator sessions | R2 | STATICALLY IDENTIFIED · M | Owner | — |
| O13 | CHECK constraints are still `NOT VALID` (legacy rows not re-verified) | Low · Medium | Validate after an `audit:integrity` run on production (decision 4) | R3 | STATICALLY IDENTIFIED · M | Owner | — |
| O14 | Unreachable database or pool timeout used to return a generic 500, and the client does not retry | Medium · Low–Medium | **Server side done**: retryable `503 SERVICE_BUSY` + `Retry-After` (`tests/unit/foundation.test.ts`). Automatic client retry: NOT DONE | R10 | AUTOMATED · H (server) | Owner | — |
| O15 | A failed password-reset e-mail is lost (no retry or outbox) and no support-side reset exists ([operations.md](operations.md) §1) | Low–Medium · Low–Medium | NOT DONE | R10 | STATICALLY IDENTIFIED · M | Owner | — |
| O16 | Support console: one shared password, no MFA, no per-person identity, no alert on use | Low–Medium · High | DECISION: keep it off when unused; MFA and a second approver once another person has the password | R5 | AUTOMATED (controls) + NOT DONE (identity, MFA) · M | Owner | Trigger: a second person gets the password |
| O17 | No retention periods, data-subject export/erasure, breach-notification procedure or vendor agreements (§9) | Not assessed · Not assessed (a legal question) | NOT DONE; ask a lawyer | R6 | STATICALLY IDENTIFIED · M | Owner | — |

## 8. Fraud and abuse cases (business logic, not just security)

### 8.1 Fraud cases

Cases the owner or staff can commit are **detected after the fact, not prevented**: the owner asked for
full editability, so the controls are audit rows and concurrency control.

| ID | Case | What exists | Weak point | Ev. |
|---|---|---|---|---|
| F1 | Owner or staff altering history | Bill edits, payment edits/deletes and reading edits are allowed and each leaves an audit row with before/after, actor and optional reason. Concurrency control stops silent overwrites | *Deletion* (see §7, O3) and the audit log's tamper resistance (§4); no alert on bulk changes | AUTOMATED · H (`tests/bills/audit.test.ts`, `update-delete.test.ts`, `tests/fleet/concurrency.test.ts`) |
| F2 | Operator inflating hours | Operators submit readings and work requests; the owner approves. Approved/pending state and every approval are audited | Nothing detects statistically odd readings (NOT DONE; a reasonable future report) | AUTOMATED · M for the approval flow (`tests/operator-money/work-requests.test.ts`, `tests/fleet/daily-logs.test.ts`); detection NOT DONE |
| F3 | Duplicate or phantom billing | A work record can be billed once (database constraint + race test). Summary bills (hand-typed lines) deliberately are not tied to work records, so they can bill anything — an owner-trust boundary, audited | The summary-bill boundary is a deliberate trust decision, not a control | AUTOMATED · H (work-based); STATICALLY IDENTIFIED · M (summary bills) |
| F4 | Payment fraud / mis-posting | Payments cannot exceed the balance or be ≤ 0; every change is audited | There is no bank reconciliation | AUTOMATED · H (`tests/bills/payments.test.ts`) |
| F6 | Unauthorized or inflated discount (a bill is made cheaper for a friend, or a kickback is hidden) | A discount is an ordinary bill field: it must be ≥ 0 and the total cannot go below zero (`src/lib/validation/bill.ts`, `bills.ts` `checkTotal`); every edit is audited with before/after | No cap, no flag above a percentage, no second approver, no report of discounted bills. Detection is reading the audit log | STATICALLY IDENTIFIED · M (code read; not exercised) |
| F7 | Backdated records (a bill or payment dated into a closed period) | Bill and payment dates are audited with the real `createdAt` of the audit row, so the gap between "dated" and "entered" is recoverable | Any parseable date is accepted: no lock period, no warning for a date far in the past or future; GST filings are not modelled, so the effect on a return is the accountant's to check | STATICALLY IDENTIFIED · M |
| F8 | Altered customer identity (a customer is renamed or its GSTIN changed after invoices were issued) | Customer edits are audited (`customer.update`) | **Issued bills print the CURRENT customer name, address, mobile and GSTIN** (`bills.ts` reads them from the live customer; only the site name and the business letterhead are frozen on the bill). Renaming or re-pointing a customer therefore changes how every past invoice reads. For GST invoices the buyer details normally must not change after issue (UNVERIFIED legal point: ask an accountant). **ACCEPTED BY DESIGN (owner decision):** renaming a customer is intentionally reflected on that customer's historical bills; no invoice snapshotting will be implemented. Recorded so it is not read as a defect; the legal point about GST buyer details remains the owner's to confirm with an accountant (UNVERIFIED) | ACCEPTED BY DESIGN · M |
| F5 | Cross-tenant abuse | Covered by §2 (isolation matrix, D1) and chain C8; per-tenant limits (`maxOperators`, `maxBillsPerDay`) are set by support only (an owner cannot raise them: `tests/security/mass-assignment.test.ts`) | Both limits are unlimited unless support sets them | AUTOMATED · H (matrix); AUTOMATED · M (`maxBillsPerDay`, `tests/bills/limits.test.ts`) |

### 8.2 Abuse cases by actor

What each actor can reach, what limits it, what proves the limit and what is still unproven. The
"proven by" column names tests; the "unproven" column is the honest edge of this document.

| ID | Actor | Can read, write, reach | Limited by | Proven by | Unproven | Ev. |
|---|---|---|---|---|---|---|
| A1 | Anonymous (no session) | The 14 public route/method pairs only: release info, health, sign-in, password reset, operator join request, and **registration of a new tenant**. Reads no tenant data | Authz inventory (every other route answers 401); rate limits per IP and identifier; no account enumeration; CSRF proxy; 512 KB body cap | `tests/unit/route-inventory.test.ts`, `npm run authz:check`; `tests/bills/routes.test.ts` ("authentication"); `tests/auth/login-throttle.test.ts`, `rate-limit.test.ts`; `scripts/check-headers.mjs` (401 without a session, in CI) | Behaviour behind Render's edge (client-IP header trust is UNVERIFIED, `docs/security.md` §3); volumetric denial of service; registration is only per-IP rate-limited (5 per hour), so tenants can be created in bulk | AUTOMATED · M |
| A2 | Authenticated owner | Reads and writes all data of its own business, including exports; may edit and delete bills, payments and readings. **Cannot** set server-owned fields (tenant, totals, paid, status, version, frozen, limits, code, `tokenVersion`, `pinHash`), freeze or unfreeze itself, or reach another tenant | Session-derived tenant; field allow-lists; optimistic concurrency; audit rows; export rate limit | `tests/security/mass-assignment.test.ts`, `cross-tenant-matrix.test.ts`; `tests/bills/audit.test.ts`; `tests/bills/export-security.test.ts` | A malicious or compromised owner can falsify history; it is detected after the fact only. No anomaly detection. OWNER is the only user role (`User.role`, schema comment): anyone who must act as owner holds an owner login, and there are no finer roles such as staff or accountant | AUTOMATED · H |
| A3 | Operator (PIN login) | The 7 operator routes: its paired machine, the active job, its own open and recent requests; may start, end and edit its own requests and submit a reading for its paired machine, all PENDING until approved. Cannot open the owner app and vice versa; cannot read bills, customers or other machines | Operator-only guard; paired-machine check; owner approval; per-mobile throttle; disable/archive revokes at once | `tests/auth/session-validity.test.ts` (session types, disabled/archived operators); `tests/operator-money/work-requests.test.ts`; `tests/fleet/daily-logs.test.ts` (paired machine); `tests/operator-join/operator-admin.test.ts`; `tests/auth/login-throttle.test.ts` | The operator routes are not in the cross-tenant matrix (the session mock has no operator sessions); inflated hours are not detected; PIN guessing odds are in C10 | AUTOMATED · M |
| A4 | Support (console password holder) | **All businesses**: list, freeze, set limits, clear data, impersonate an owner with that owner's full powers | Off unless the variable is set; strict throttle; 1 h DB-backed revocable sessions; written reason; SUPPORT attribution; Clear Data keeps audit rows and operator salary history | `tests/auth/support-routes.test.ts`, `support-sessions.test.ts`, `support-service.test.ts`, `support-attribution.test.ts`, `session-validity.test.ts` (impersonation ends with its support session) | One shared password, no MFA, no per-person identity, no alert on use; whether the console is enabled and how strong the password is in production: UNVERIFIED | AUTOMATED · M; production UNVERIFIED |
| A5 | A second tenant (another owner, or a registered attacker) | Only its own business; tenant A's ids answer 404 and change nothing | Session-derived tenant; service-layer `businessId` filters; 404 not 403 | `tests/security/cross-tenant-matrix.test.ts` (43 handlers, 14 feeds, the register export), `tests/bills/tenant-isolation.test.ts`, `tests/fleet/tenant-isolation.test.ts`, `tests/integrity/integrity.test.ts` | Routes whose id is not in the path, operator routes and 7 owner GET feeds are outside the matrix; no row-level security; response timing was not examined | AUTOMATED · H (covered scope) |
| A6 | Database credential holder | **Everything**: all tenants, password and PIN hashes, audit rows; bypasses every application control and, if the role owns the table, the audit trigger | Nothing in the application; provider access controls (UNVERIFIED); rotation if a leak is ever suspected (O1 withdrawn: the owner states none occurred) | `tests/auth/support-service.test.ts` and the integrity control prove the trigger blocks **ordinary** sessions only; the bypass was read, not exercised | Who holds the credential, what role the app uses and what the provider logs: all UNVERIFIED | STATICALLY IDENTIFIED · M; provider UNVERIFIED |
| A7 | CI / GitHub account holder | Push to `main` (a deploy if Render auto-deploys: UNVERIFIED), push a `v*` tag (a signed APK to every installed device), read Actions secrets by editing a workflow | Account security (2FA and branch protection UNVERIFIED); pinned Actions; CI tests (not run on tag builds) | None automated; workflow structure read from `.github/workflows` | Collaborators, branch protection, 2FA, secret scanning ([operations.md](operations.md) §3, §4.1: all UNVERIFIED) | STATICALLY IDENTIFIED · L |

Personas an outside reviewer may ask about: a **curious operator** is A3; a **former employee** is A3
after disable or archive (revoked on the next request, tested); an **angry employee** is A2 if they
hold the owner login; a **compromised account** is A2 or A3 until sign-out-everywhere; a **malicious
tenant admin** is A5; an **automated bot** is A1; an **insider with legitimate access** is A4 or A6.

## 9. Data protection, vendors and tenant lifecycle (gaps stated plainly)

Evidence: STATICALLY IDENTIFIED · M. The lists below were compiled from `prisma/schema.prisma`, the
code and the CI/hosting configuration; no data inventory was run against production.

**Personal data held:** owner name/e-mail/phone/password hash; operator name, mobile, PIN hash,
salary and advance records; customer name, mobile, address, GSTIN; bank account details printed on
bills; IP addresses (hashed) in rate-limit buckets and request logs; audit snapshots of all of the
above. **Processors:** Supabase (database), Render (hosting and logs), Resend (password-reset
e-mail), GitHub (source, CI, APK releases). **Not defined:** retention periods, a data-subject
export/erasure procedure, log retention, a breach-notification procedure, vendor agreements/DPAs.
Whether India's DPDP Act (or any other regime) applies, and what it requires, is a question for a
lawyer — this repository does not implement a consent or erasure workflow. Where credentials and
recovery information live, and who holds each, is a table of UNVERIFIED cells in
[operations.md](operations.md) §2.4 and §4.

**Tenant lifecycle:** create (register), limit and freeze (support), wipe business data (support
"Clear Data", which deliberately keeps audit rows and operator salary history). **Missing:** owner
self-service export, offboarding/deletion of a whole tenant (blocked by the append-only audit
trigger by design), and quota accounting beyond operator and bills-per-day counts.

## 10. Enterprise relevance versus current necessity

"Enterprise-grade" is not one thing, and it is not microservices or five-nines uptime. Judged
against a single-region, single-owner-operator SaaS. *Enterprise importance* is how an enterprise
security questionnaire would weigh the practice; *necessity now* is what this product needs today.
Both are judgements. Necessity vocabulary: Critical, Necessary, Soon, Future (with its trigger),
Not justified, Not applicable. The last column is what the repository shows today.

### 10.1 Practices

| Practice | Enterprise importance | Necessity now | In this repo today (status · conf.) |
|---|---|---|---|
| Tenant isolation tests, authorization inventory | Critical | Critical: money and customer data | AUTOMATED · H (D1, D2) |
| Idempotency, concurrency control, integrity checks | High | Critical: money | AUTOMATED · H (D5) |
| Append-only audit trail | High | Necessary | AUTOMATED · H (D6); tamper-evidence NOT DONE |
| CI gates, pinned actions, license check | High | Necessary, proportionate | AUTOMATED · M (D10) |
| SBOM | High | Medium: already produced at no cost | AUTOMATED (generated in CI, attached to releases) · M |
| Restore drill and tested backups | High | Necessary | RUNTIME-VERIFIED (logical drill) · M; provider restore UNVERIFIED |
| Owner MFA | High | Future: when a second person has access or the customer count grows; premature for one owner (DECISION) | NOT DONE (D3) |
| Support-console approvals and per-person identity | High | Future: necessary the moment a second person gets the password | NOT DONE (§3) |
| Uptime monitoring and alerting | High | Soon: one monitor is cheap | NOT DONE (D13) |
| SIEM, central log analytics | High | Not justified | NOT DONE |
| Separate DB roles, then row-level security | High | Worth doing (cheap, strong): DB roles first | Roles STATICALLY IDENTIFIED · L (SQL documented, not applied); RLS NOT DONE |
| SSO/SAML | High for enterprise buyers | Not applicable today (no organisational customers, one owner); Future if a customer with several staff requires it | NOT APPLICABLE |
| SCIM provisioning | High for large organisations | Not applicable today (one owner; operators are managed in the app) | NOT APPLICABLE |
| Microservices, Kubernetes, service mesh | Irrelevant to assurance | Not justified: would add failure modes without a user-visible gain | NOT APPLICABLE |
| Multi-region failover, formal SLAs | High for large SaaS | Not justified | NOT DONE (deliberately) |
| Formal SLOs and error budgets | High | Not yet: they need monitoring to measure them; **no SLO is claimed today** | NOT DONE |

### 10.2 Delivery metrics (DORA)

The five current DORA metrics. **None is measured; no number is quoted** because none was measured,
and "unavailable / insufficient history" is a valid answer for a solo project. When one is measured,
record the date range and the source next to the value.

| Metric | Status | Could be derived from | Why it is unavailable now |
|---|---|---|---|
| Deployment frequency | UNAVAILABLE (not measured) | Render deploy history, or the GitHub Deployments API if the service reports deployments (UNVERIFIED) | Render's history is not in the repository; tags and merges to `main` approximate it but are not deployment records |
| Change lead time | UNAVAILABLE (not measured) | GitHub commit or PR-merge times, joined to the Render deploy-live time | Needs both sources; the deploy side is UNVERIFIED |
| Change fail rate | UNAVAILABLE (not measured) | Failed or rolled-back deploys in the Render history over total deploys; GitHub revert PRs | No definition of a "failed deployment" has been agreed |
| Failed deployment recovery time | UNAVAILABLE (not measured) | Render deploy history: time from a failed or rolled-back deploy to the next healthy one | Same source gap; with no alerting (D13) a failure is also noticed late |
| Deployment rework rate | UNAVAILABLE (not measured) | GitHub PR and commit history: the share of deployments that were unplanned fixes (needs a label such as `fix`) | The repository defines no such label |

## 11. Continuous assurance — who runs what, when

| Cadence | Check | Where | Owner | Last recorded |
|---|---|---|---|---|
| Every push/PR | lint, typecheck, tests, migration scenarios, authz coverage, build (web + Android bundle), configuration gate, security headers on a running production server, audit, licenses, SBOM, CodeQL, dependency review | CI | Owner (CI enforces) | Each run; the result lives on GitHub (UNVERIFIED here) |
| Before/after each deploy | `npm run check:headers -- <live URL>` (or `curl -I`), open `/api/health/ready` | manual | Owner | None recorded |
| Weekly | `npm run audit:integrity` against production (read-only) · `npm audit --omit=dev` · review Dependabot PRs | owner | Owner | None recorded |
| Per release | read the SBOM and `npm run licenses`; confirm CI was green on the tagged commit | owner | Owner | None recorded |
| Quarterly | provider backup restore into a scratch project (`docs/runbook-recovery.md` §5); review who has access to GitHub, Render, Supabase, Resend and the support password ([operations.md](operations.md) §4: register, queries 1–6, review log); rotate secrets | owner | Owner | None recorded (the access-review log in operations.md §4.3 is empty) |

## 12.1 Exact manual actions, one per owner item (nothing below has been performed)

Kind: **code** = a repository change, **setting** = a production or provider setting, **decision** = a business choice.
"Blocks" = whether the audit would still call the system unsafe to rely on until it is done.

| Audit point | Exact action | Kind | Blocks production? |
|---|---|---|---|
| 38, O5 | Supabase Dashboard > Database > Backups: record plan, frequency, retention, PITR. Restore the latest backup into a NEW project; run `npx prisma migrate status`, `npm run audit:integrity`, open a bill; record the time taken; delete the scratch project ([operations.md](operations.md) §2.5b) | setting | **Yes** |
| 94, 7 | Confirm or change RPO/RTO in `docs/runbook-recovery.md` §1 using the measured restore time | decision | No |
| 39 | Decide tolerable downtime for bill creation, payment recording, operator readings; create a free uptime monitor on `https://<your-app>/api/health/ready` and choose who receives its alert | decision + setting | No |
| 73 | Render > service > Settings > Build & Deploy > Pre-Deploy Command = `npx prisma migrate deploy && npm run check:config -- --production` (needs Node ≥ 22.6) | setting | No |
| 13 | Render > Environment: add `JOIN_CODE_SECRET` = a new random value (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), different from `AUTH_SECRET`. Pending operator join requests must be re-filed once | setting | No |
| 50, 11, O2 | Create the `excavator_app` role (`docs/security.md` §15) on a scratch/branch database first; run `npm test` and `npm run audit:integrity` against it; then in Render set `DATABASE_URL` to it and `MIGRATE_DATABASE_URL` to the owner connection; verify with `npm run check:db-role` (must print `least-privilege: yes`) | setting | No |
| 37 | Record Render plan, instances, spin-down, auto-deploy rule, health path and shutdown delay in [operations.md](operations.md) | setting | No |
| 47, 43 | Fill vendor contacts/plan tiers, tolerable downtime and emergency contacts in [operations.md](operations.md) §2 | decision | No |
| 75, 76, 77 | Fill the unknown cells of the asset inventory (§3.5), the who-can-change-what table (§3) and the access register (§4); run its six queries once and log the review | decision | No |
| 87 | Run `npm run audit:integrity` against production weekly and record the date (or schedule it with a read-only credential) | setting | No |
| 10, 20 | Decide hard-delete vs void/credit-note for bills, and have an accountant review the invoice format and GST handling | decision | No |
| 26, 27 | Optional: in GitHub enable secret scanning and push protection, protect `v*` tags, and add an `environment:` with a required reviewer to the release job | setting | No |

## 12. Decisions waiting for the owner

Deadline "—" means none has been set (§1.5). The numbers are referenced from other documents; keep them.

| # | Decision | Closes | Ev. | Owner | Deadline |
|---|---|---|---|---|---|
| 1 | ~~Rotate the exposed database and e-mail credentials~~ **Withdrawn**: the owner confirmed no credential was exposed. No rotation was performed or is claimed | O1 (withdrawn), R6 | OWNER STATEMENT (not verifiable here) | Owner | — |
| 2 | Apply the least-privilege database role (`docs/security.md` §15), then set `MIGRATE_DATABASE_URL` | O2, R6, R7 | STATICALLY IDENTIFIED · L | Owner | — |
| 3 | Set `JOIN_CODE_SECRET` in Render to a fresh random value (pending join requests must be re-filed once) | R6 | UNVERIFIED · L | Owner | — |
| 4 | Validate the three `NOT VALID` CHECK constraints after running `npm run audit:integrity` on production | O13, R3 | STATICALLY IDENTIFIED · M | Owner | — |
| 5 | Bills: keep hard delete, or switch to "void with reason" (accountant's advice) | O3, R7 | DECISION · M | Owner | — |
| 6 | Owner MFA and a second approver for support actions — now, or when a second person joins | O4, O16, R4, R5 | STATICALLY IDENTIFIED · M | Owner | Trigger: a second person joins |
| 7 | Read the Supabase backup settings, do ONE provider restore into a scratch project and write down how long it took, then agree RPO/RTO ([operations.md](operations.md) §2.5b has the exact steps) | O5, R8 | UNVERIFIED · L | Owner | Before relying on the service (production blocker) |
| 8 | Point an uptime monitor at `/api/health/ready`; decide who gets the alert | O6, R10 | STATICALLY IDENTIFIED · M | Owner | — |
| 9 | Confirm in GitHub: branch protection, secret scanning, 2FA; in Render: "After CI Checks Pass" | R9 | UNVERIFIED · L | Owner | — |
| 11 | ~~Snapshot buyer details on issued invoices~~ **Closed: ACCEPTED BY DESIGN** (customer renames are intentionally reflected on historical bills; no snapshotting). Still open for the owner, optional: a discount flag/cap and a backdating warning or lock (F6, F7) | R3, R7 | ACCEPTED BY DESIGN (rename); STATICALLY IDENTIFIED · M (F6, F7) | Owner | — |
| 10 | Fill the UNVERIFIED cells in [operations.md](operations.md) (tolerable downtime per process, vendor contacts, who holds each secret, the access register) and set a deadline for each row above | R8, R9 | UNVERIFIED · L | Owner | — |
