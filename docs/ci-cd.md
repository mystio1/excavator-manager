# CI/CD and branch protection

## What runs

| Workflow | Trigger | What it checks |
|---|---|---|
| `ci.yml` → **verify** | every PR, every push to `main` | `prisma validate`; all migrations apply to a **fresh Postgres**; migrations ≡ `schema.prisma` (no drift); migration safety tests (upgrade-with-data, abort guard); ESLint; `next typegen` + `tsc`; the Vitest suite against a Postgres service container; production `next build`; `npm audit --omit=dev --audit-level=critical`; `npm run authz:check` (every API route guarded, matrix current); `npm run check:config -- --production` (configuration passes the same validation as the running app); `npm run check:headers` against a **running** `next start` (HSTS, CSP, framing, sniffing, no-store on the API); `npm run licenses` (no strong-copyleft in production dependencies); `npm run sbom` (CycloneDX can be generated) |
| `ci.yml` → **android-bundle** | same | `npm run build:android` still produces the static export |
| `codeql.yml` | PR, push to `main`, weekly | CodeQL `security-extended` for JavaScript/TypeScript |
| `dependency-review.yml` | PR | blocks new dependencies with known high-severity advisories |
| `release-android.yml` | push of a `v*` tag | builds, signs and publishes the APK + `version.json` + a CycloneDX `sbom.cdx.json` of production dependencies |
| Dependabot (`dependabot.yml`) | weekly | npm (minor/patch grouped) and GitHub Actions updates |

All third-party actions are **pinned to commit SHAs** (with the tag in a
comment); Dependabot proposes updates.

Run the same checks locally: `npm run check` (lint + typecheck + prisma validate
+ tests) and `npm run test:migrations`. DB-backed tests need `DATABASE_URL`
(or `TEST_DATABASE_URL`) pointing at a **non-production** database.

## Settings that live in GitHub / Render (cannot be enforced from the repo)

Configure these once; they are what make a failing CI actually block a release.

**GitHub → Settings → Branches → Branch protection rule for `main`:**
* Require a pull request before merging (≥ 1 approval once there is a second
  contributor; for a solo repo at least require PRs so CI runs before merge)
* Require status checks to pass — use the **job names** exactly as GitHub lists them
  (Settings → Branches shows them once each workflow has run at least once):
  **`Lint, typecheck, tests, migrations, build`**, **`Android static bundle still builds`**,
  **`Analyze (javascript-typescript)`** (CodeQL) and **`review`** (dependency review);
  require branches to be up to date
* Block force pushes and deletions; include administrators
* (Optional) require signed commits and linear history

**GitHub → Settings → Code security:** enable Dependabot alerts + security
updates, secret scanning, and push protection.

**Render → service → Settings → Build & Deploy:** set **Auto-Deploy** to
**"After CI Checks Pass"** (not "On Commit"), so a red CI never deploys.
Pre-deploy command stays `npx prisma migrate deploy` — if a migration's safety
guard aborts (e.g. a sub-paisa legacy value) the deploy fails and the previous
release keeps serving.

**Render → Health Check Path:** `/api/health` (liveness, DB-free). Point an
uptime monitor/alert at `/api/health/ready` (database + config).

Workflow tokens are least-privilege: `ci.yml` has `permissions: contents: read` for every job; the
release workflow needs `contents: write` only to publish the release.

## Known gaps

* **Configuration is only gated if the deploy runs the gate.** `npm run check:config -- --production`
  runs in CI with CI's own values; to make a bad production configuration FAIL the deploy, Render's
  pre-deploy command would be `npx prisma migrate deploy && npm run check:config -- --production`
  (needs Node ≥ 22.6). Whether Render is set that way is **UNVERIFIED**.
* **The Gradle compile of the Android app is not in CI.** The `android-bundle` job builds the web
  bundle only; native Java/Kotlin changes (the updater, the file saver) are first compiled by the release
  workflow on a tag. A compile error would therefore surface at release time.
* **The release workflow does not re-run the tests.** It builds whatever commit the `v*` tag
  points at. Tag only commits whose CI run was green (or add a `needs`/status check to the
  workflow). There is also no build-provenance attestation for the APK.

* Branch protection, secret scanning and Render's "After CI Checks Pass" are
  settings, not code: they are **UNVERIFIED** from the repository alone.
* `npm audit` still reports advisories in transitive build tooling (see
  docs/security.md → "Known dependency advisories"); CI fails only on
  `critical`. A critical advisory can appear between two CI runs without any code change (this
  happened to `@capacitor/android` on 2026-10-06/07 and was fixed by a patch upgrade), so a green
  build last week does not mean a green build today.
