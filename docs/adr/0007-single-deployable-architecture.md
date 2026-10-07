# ADR-0007: One deployable service and one Postgres (modular monolith)

Status: accepted

## Context
One owner-operator uses the product today ([ADR-0004](0004-csrf-and-session-strategy.md): "a single operator-owner"). The data model is multi-tenant and money-critical. Enterprise quality here means clear boundaries, strong controls, observability, reliability, security and repeatable deployment; it does not mean a number of services. If the current architecture can safely serve the product, it stays a monolith.

What the repository shows (verified by reading it):

| Fact | Evidence |
|---|---|
| One deployable server: the Next.js app (`next start`). The Android APK is a static bundle with no server ([ADR-0005](0005-web-and-android-from-one-codebase.md)) | `package.json` scripts, `docs/architecture.md` |
| One data store: Postgres through Prisma 7 and `@prisma/adapter-pg` | `src/lib/db.ts`, `package.json` |
| No Redis, message broker, queue library, worker process or scheduler | `package.json` dependencies; a search of `src/`, `scripts/` and `.github/` finds none. `src/lib/rateLimit.ts` states that no external service (Redis) is used |
| No Docker, Compose, Kubernetes, Terraform or other infrastructure-as-code file, and no `render.yaml` or `Procfile` | none found in the repository; `docs/operations.md` says the same |
| In-process background work is limited to two things: the password-reset e-mail via Next's `after()`, and an opportunistic (about 1% of calls) purge of expired idempotency keys and rate-limit buckets | `src/app/api/auth/forgot-password/route.ts`, `src/lib/idempotency.ts`, `src/lib/rateLimit.ts` |
| Scheduled jobs exist only on GitHub (weekly CodeQL, Dependabot), not in the app | `.github/workflows/codeql.yml`, `.github/dependabot.yml` |
| Shared state lives in the database, so instances are interchangeable: rate-limit counters, idempotency keys, support sessions | `docs/security.md` section 3, ADR-0004 |
| Modular boundaries inside the one service: 18 modules in `src/lib/services/`, each taking `businessId` explicitly; UI code may not import them at runtime (ESLint `no-restricted-imports`); API routes are thin | `src/lib/services/`, `eslint.config.mjs`, `docs/architecture.md` |
| Money invariants rely on single-database transactions: payments lock the bill row, `BillItem.workSessionId` is UNIQUE, audit rows commit with the change they describe | [ADR-0002](0002-idempotency.md), [ADR-0006](0006-optimistic-concurrency-and-audit.md) |
| Release path: CI, then Render deploys `main` with pre-deploy `prisma migrate deploy`; the APK is cut by a `v*` tag. The Render settings themselves are UNVERIFIED | `docs/ci-cd.md`, `docs/architecture.md` |

## Decision
* **One deployable Next.js service plus one Postgres database.** Web UI, API, authentication and the support console are the same process.
* **Modularity lives in code, not in the network.** Business logic stays in `src/lib/services/*`, called by thin route handlers; boundaries are enforced by ESLint, explicit `businessId` arguments and tests that run two tenants against each other.
* **No queues, Redis, containers, orchestration or background workers.** Work that must not be lost goes into the database inside the request's transaction. Work that can be lost without harm stays in-process (`after()`, opportunistic cleanup).
* **Enterprise controls are added inside the monolith** (authorization matrix, CI gates, audit trail, health and readiness endpoints, structured logs, restore drill), not by adding services.
* **New infrastructure needs a new ADR** that names which trigger below has been met.

## Alternatives considered

| Alternative | Why not now | Trigger to revisit |
|---|---|---|
| **Microservices** (for example billing, operators, work records as separate services) | Bills, payments, work sessions and audit rows commit in one transaction; splitting turns them into distributed transactions and loses the UNIQUE and CHECK guarantees. One developer, one deploy to reason about | A second team must release a domain independently **and** that domain's data can be separated without needing to commit atomically with bills, payments or audit rows; or a compliance requirement forces a data domain into its own boundary |
| **Separate API service** (UI hosted apart from the API) | The API already serves the web UI on the same origin and the Android app cross-origin ([ADR-0005](0005-web-and-android-from-one-codebase.md)). A split adds a second deploy plus a CORS and cookie surface ([ADR-0004](0004-csrf-and-session-strategy.md)) for no current gain | The UI must be hosted and scaled separately from the API (for example served from a CDN while the API scales on its own); or a public or third-party API needs its own versioning, limits or availability target; or the app moves to bearer tokens ([ADR-0004](0004-csrf-and-session-strategy.md) option 2) and an auth boundary is worth isolating |
| **Background job queue or worker** (a broker such as Kafka or RabbitMQ, or a job library) | The only asynchronous work is one e-mail (`after()`) and housekeeping. A lost reset e-mail is accepted and logged, not retried ([operations.md](../operations.md) section 1) | Any feature that must survive a restart or be retried or scheduled: e-mail beyond password reset (for example bills), scheduled exports or reminders, PDF generation, imports, or work longer than a request may run. First step then: a Postgres outbox table drained by the existing service; add a broker only if that is not enough |
| **Multi-region or high availability** | RTO and RPO targets are only proposed, not agreed (`docs/runbook-recovery.md` section 1); a paper fallback exists ([operations.md](../operations.md) section 2); Render plan, instance count and Supabase region and backup plan are UNVERIFIED. The code already allows more than one instance because shared state is in Postgres | The owner or a customer signs a written availability target (RTO or RPO) that single-region operation cannot meet; or tenants other than the owner depend on contractual uptime; or a provider outage exceeds the tolerable downtime in the runbook. First steps: confirm backups or PITR and run a second identical instance in one region; multi-region only after that |
| **Containers, Kubernetes, Terraform, service mesh** | Render builds from git; the service can be recreated from git plus its environment variables ([runbook-recovery.md](../runbook-recovery.md) scenario E). Nothing here needs orchestration | Moving to a host that requires a container image; or more than one environment (for example staging) that manual dashboard setup can no longer keep identical; or more than one person changing infrastructure so configuration drift becomes a real risk |

## Consequences
* One unit to deploy, roll back (Render rollback) and observe; one log stream; local development is `next dev` plus one Postgres. The operating load fits one owner.
* Money operations stay exactly-once and attributable because they are single-database transactions.
* Accepted costs:

| Cost | Detail |
|---|---|
| Shared failure domain | A bad deploy or one expensive request affects everything. Example: the Excel register is built in memory (capped at 20,000 bills, per `docs/operations.md`) |
| Lossy side work | A password-reset e-mail is lost if the process restarts after the response; there is no retry or outbox. Cleanup is probabilistic, not scheduled |
| Scaling limits | Scaling out means more identical instances sharing one database. The pool is `DB_POOL_MAX` (default 10, clamped to 12) against a Supabase pooler cap taken from a code comment (15, not confirmed); a second instance or the pre-deploy migration needs connections of its own (`docs/operations.md` section 1) |
| One host name | The APK hard-codes the API host (`API_BASE` in `src/lib/api-client.ts`), so moving or renaming the service breaks installed apps until a new APK ships |
| No tenant load isolation | All tenants share one process and one pool |

* Guardrails that keep the monolith honest: the ESLint import rule, `businessId` as an explicit argument, tenant-isolation tests, the route authorization check in CI (`npm run authz:check`), the readiness probe and `npm run check:config` ([configuration.md](../configuration.md)).
* This decision is reviewed when any trigger in the table above is met, not on a calendar.
