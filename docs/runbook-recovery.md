# Disaster recovery runbook

Scope: the production PostgreSQL database (Supabase) and the Render web service.
Written so someone who is not the original author can follow it at 2 a.m.

> **Honest status.** The *procedure* below and the logical backup→restore drill
> (`scripts/restore-drill.mjs`) have been exercised against the development
> database. Restoring the **hosting provider's own** backups (Supabase daily
> backups / point-in-time recovery) has **not** been tested by this repository —
> do the "provider restore test" in §5 once and record the date here.
>
> Last provider restore test: **never performed — UNVERIFIED**
> Last logical drill (dev database): see §6.

## 1. Objectives (proposed — confirm with the business owner)

| | Target | Basis |
|---|---|---|
| **RPO** (max data loss) | ≤ 24 h with daily backups; ≤ 5 min if Supabase PITR is enabled on the plan | Bills/payments are re-enterable from paper records within a day; if that is unacceptable, enable PITR |
| **RTO** (max downtime) | ≤ 2 h to a working restored database; app redeploy ≤ 15 min | Drill timing in §6 + Render deploy time |

These are *targets*, not measured guarantees. Revisit when the number of
customers or the payment volume grows.

## 2. What exists

* **Database**: Supabase Postgres. Backups/PITR are a plan-level Supabase feature
  — confirm in the Supabase dashboard (Project → Database → Backups) what the
  current plan retains. **UNVERIFIED from this repo.**
* **Schema**: fully reproducible from `prisma/migrations/` (CI applies it to an
  empty database on every build and proves upgrade-with-data and the abort
  guard: `npm run test:migrations`).
* **Application**: reproducible from git + Render environment variables
  (names in `.env.example`; values live only in Render/Supabase).
* **Audit trail** lives in the same database (append-only) — it is restored with
  it, so recovery never loses *who changed what* up to the restore point.
* **Android app**: releases are GitHub Releases (`v*` tags); nothing to recover
  server-side.

## 3. Scenarios

### A. Bad deploy (the app is broken, the data is fine)
1. Render → service → **Events/Deploys** → pick the last good deploy → **Rollback**.
2. If the bad release included a migration, **do not roll the database back
   blindly**. This release's migrations are mostly additive (new tables/columns), but
   three things are NOT: the money migration changes column types (float → exact
   decimal), the legacy join-request conversion moves data (operators' pending PIN
   hashes), and new CHECK constraints reject writes the previous code could make
   (e.g. a payment overpaying a bill, or lowering a bill total below what is paid —
   the previous code would then fail those requests). Rolling the *code* back past
   this release therefore needs the database restored from a pre-migration backup
   (scenario C), or fixing forward on the new code.
3. Verify `/api/health` (200) and `/api/health/ready` (200) and log in.

### B. A migration aborted during deploy
`prisma migrate deploy` is the Pre-Deploy Command, so a failing migration fails
the deploy and the previous release keeps serving. The first migration of this
release, `20261004085900_preflight_guards`, is **read-only** and checks everything
that could make the later ones abort — amounts with more than 2 decimals, a work
session billed twice, two live readings for the same day, duplicate pending legacy
join requests — and reports **all** problems in one message, before anything is
changed. It aborts rather than silently rounding or deleting financial data.

Recovery:
1. Read the message; fix the listed rows (each line includes a query to list them).
2. Prisma recorded the migration as *failed* and refuses to continue until you say
   it was rolled back — from a shell with the production `DATABASE_URL`:
   ```
   npx prisma migrate resolve --rolled-back 20261004085900_preflight_guards
   npx prisma migrate deploy
   ```
   (use the name of whichever migration the message names; the previous release
   keeps serving the whole time).
3. If the money migration times out on its table lock (`lock_timeout` 20 s: it aborts
   cleanly instead of blocking traffic), do the same `resolve --rolled-back` for it and
   redeploy in a quieter moment.

**Rolling-deploy overlap:** while the pre-deploy command runs, the *old* instance is
still serving. An operator who files a join request in that window writes the old
format (a PIN hash on an operator row) *after* the conversion ran. After the deploy
completes, re-run the (idempotent) conversion once, or simply deploy at a quiet hour:
```sql
INSERT INTO "OperatorJoinRequest"
  ("id","businessId","name","mobile","pinHash","verificationHash","status","operatorId","expiresAt","createdAt")
SELECT 'legacy_' || o."id", o."businessId", o."name", o."mobile", o."pinHash", '', 'PENDING', o."id",
       CURRENT_TIMESTAMP + INTERVAL '7 days', o."createdAt"
FROM "Operator" o
WHERE o."pinHash" IS NOT NULL AND o."canLogin" = false AND o."isArchived" = false
  AND NOT EXISTS (SELECT 1 FROM "OperatorJoinRequest" r WHERE r."id" = 'legacy_' || o."id");
UPDATE "Operator" SET "pinHash" = NULL
WHERE "pinHash" IS NOT NULL AND "canLogin" = false AND "isArchived" = false
  AND EXISTS (SELECT 1 FROM "OperatorJoinRequest" r WHERE r."id" = 'legacy_' || "Operator"."id");
```

### C. Data loss or corruption (wrong deletes, bad bulk edit, DB incident)
1. **Stop the bleeding**: set `SUPPORT` freeze on affected businesses (support
   console) or scale the Render service to 0.
2. Identify the **last known-good time** (audit trail:
   `SELECT * FROM "AuditLog" WHERE "businessId" = … ORDER BY "createdAt" DESC`).
3. Restore into a **new** Supabase project/branch from the provider backup/PITR
   at that time (never over the live database first).
4. Verify in the restored copy: row counts, newest bills/payments, a few bills'
   `paidAmount` vs `SUM(Payment.amount)`.
5. Reconcile the gap (records created after the restore point) from the audit
   trail of the *damaged* database, which you kept.
6. Point Render's `DATABASE_URL` at the restored database (or restore data into
   the live one in a maintenance window), redeploy, run `/api/health/ready`.
7. Run `SELECT count(*) FROM "Bill" b WHERE b."paidAmount" <> coalesce((SELECT sum(amount) FROM "Payment" p WHERE p."billId" = b.id),0);`
   — must be 0 (payment totals are derived).

### D. Supabase / region outage
Nothing in the app depends on Supabase-specific features except the hosted
Postgres. Recovery path = restore a backup into any Postgres 16 (another
Supabase project, Render Postgres, Neon…), set `DATABASE_URL`, run
`npx prisma migrate deploy` (no-op if restored with the migrations table),
redeploy. Mind `DB_POOL_MAX` against the new provider's connection limit.

### E. Lost environment variables / Render account
Recreate from `.env.example`. `AUTH_SECRET` loss logs everyone out (sessions
cannot be verified) — generate a new one. If `JOIN_CODE_SECRET` is unset it also
keys the HMAC of operator-join verification codes, so every *pending* coded join
request becomes unapprovable: decline them and have the operators re-file (a lost
`JOIN_CODE_SECRET` has the same effect). (Support sessions are DB-backed and do
not use either.) `APP_URL`, `SUPPORT_ACCESS_PASSWORD`,
`RESEND_*`, `GITHUB_RELEASE_REPO`, `MIGRATE_DATABASE_URL` are all re-settable.

### F. Leaked secret
Revoke → rotate → redeploy → verify → check logs for use. For the database
password: rotate in Supabase, update Render, redeploy. For `AUTH_SECRET`: rotate
(all users sign in again; pending join requests must be declined and re-filed unless `JOIN_CODE_SECRET` is set).
If the old key did NOT leak, roll it instead with `AUTH_SECRET_PREVIOUS` and nobody is signed out
([configuration.md](configuration.md) section 8.2); if it DID leak, replace it outright. For the Android keystore: see `release-android.yml`;
a rotated key means a new app identity for sideloaded updates.

## 4. Rollback summary

| What | How |
|---|---|
| Code | Render → Rollback to previous deploy |
| Android release | publish a new tag (the app only updates *forward*); `[force-update]` to push it |
| Schema | prefer fix-forward; the money type change, the legacy join-request conversion and the new CHECK constraints are not backward compatible with the previous code — roll back past them only via a backup restore |
| Data | provider backup/PITR → new database → reconcile (§3C) |

## 5. Provider restore test (do this once; it is the real test)

1. Supabase dashboard → create a **new empty project** (or use a branch).
2. Restore the latest backup of production into it (dashboard restore, or
   `pg_restore` of a downloaded backup).
3. Point a local checkout at it (`DATABASE_URL=…`), run `npx prisma migrate
   status` (must report up to date), `npm run dev`, log in, open a bill.
4. Record the date, how long it took (this is your real RTO), and anything that
   surprised you at the top of this file. Delete the scratch project.

## 6. Logical drill (automated)

`node scripts/restore-drill.mjs` dumps every table of the database named by
`DATABASE_URL` (use a **non-production** database), builds a scratch schema from
all migrations, restores the rows in foreign-key order, compares per-table row
counts and content checksums, then drops the scratch schema and deletes the
dump files. It never writes to the source tables.

**Latest run (development database, 2026-10-08 01:42 IST): PASSED** — 26 tables restored,
every table's row count and content checksum identical; dump 1.3 s + scratch schema from all
migrations 12.3 s + restore 0.9 s = 14.5 s end to end (5 businesses, 2 bills: a tiny dataset).

Previous run (2026-10-05): PASSED, 26 tables / 303 rows, 19.1 s end to end: — 26 tables / 303 rows
dumped in 1.7 s, scratch schema built from all migrations in 16.2 s, rows
restored in 1.2 s (19.1 s end to end), every table's row count and content
checksum identical. The dataset is tiny, so these timings are a lower bound, not
a prediction for production — rerun it on a production-sized copy to get a real
RTO.

It proves our migrations + a full data reload reproduce the data exactly; it
does **not** prove the hosting provider's backups work — that is §5.

## 7. After any recovery
* Run `npm run audit:integrity` against the recovered database (read-only; see
  `docs/invariants.md`). Every *error* rule must pass before users are let back in.
* Check `/api/health/ready`, log in as an owner and as an operator, open the
  newest bill, record a test payment on a throwaway bill and delete it.
* Look at `SELECT action, count(*) FROM "AuditLog" WHERE "createdAt" > now() - interval '1 day' GROUP BY 1`
  to confirm writes (and their audit entries) are flowing.
* Write a short post-mortem: what happened, detection time, recovery time, what
  would have prevented it. Add detection gaps to this runbook.
