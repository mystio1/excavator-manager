#!/usr/bin/env node
/**
 * Financial / referential integrity audit — READ ONLY.
 *
 *   npm run audit:integrity                     # every business
 *   npm run audit:integrity -- --business=<id>  # one business
 *   npm run audit:integrity -- --json           # machine-readable (e.g. for a scheduled job)
 *
 * Verifies the invariants in docs/invariants.md directly against the database:
 * bills reconcile with their payments and lines, totals follow the GST formula,
 * every row stays inside its tenant, and the database-level controls (append-only
 * audit trigger, CHECK constraints, billed-once unique index) are still in place.
 *
 * It runs inside a READ ONLY transaction and prints only counts and row ids —
 * never names, amounts, contact details or connection strings. Exit code 1 when
 * any "error" invariant is violated (warnings alone exit 0), so it can gate a
 * deploy or run on a schedule.
 *
 * Run it: after restoring a backup, before/after a migration, and periodically
 * (weekly is plenty at this scale).
 */
import "dotenv/config";
import pg from "pg";
import { runChecks } from "./lib/integrity-checks.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL.");
  process.exit(2);
}
const args = process.argv.slice(2);
const businessId = args.find((a) => a.startsWith("--business="))?.slice("--business=".length) || null;
const asJson = args.includes("--json");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const schema = new URL(url).searchParams.get("schema");
  if (schema) await client.query(`SET search_path TO "${schema.replace(/"/g, '""')}"`);

  const results = await runChecks(client, { businessId });
  const errors = results.filter((r) => r.severity === "error" && r.count > 0);
  const warnings = results.filter((r) => r.severity === "warn" && r.count > 0);

  if (asJson) {
    console.log(JSON.stringify({ businessId, ok: errors.length === 0, results }, null, 2));
  } else {
    for (const r of results) {
      const mark = r.count === 0 ? "ok  " : r.severity === "error" ? "FAIL" : "warn";
      const detail = r.count === 0 ? "" : `  ${r.count} row(s): ${r.sample.join(", ")}${r.count > r.sample.length ? ", …" : ""}`;
      console.log(`${mark}  ${r.id} — ${r.title}${detail}`);
    }
    console.log(
      `\n${results.length} checks: ${results.length - errors.length - warnings.length} ok, ${warnings.length} warning(s), ${errors.length} failure(s).`,
    );
  }
  process.exitCode = errors.length > 0 ? 1 : 0;
} finally {
  await client.end();
}
