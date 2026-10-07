#!/usr/bin/env node
/**
 * Backup → restore DRILL (logical, Node-only — no pg_dump needed).
 *
 * Proves, end to end, that a full logical backup of the application database can
 * be taken and restored into a brand-new database schema built from the
 * migrations, with identical content:
 *
 *   1. dump    every table of the source schema to NDJSON files (temp dir)
 *   2. build   a scratch schema and apply ALL migrations to it (`prisma migrate deploy`)
 *   3. restore the rows in foreign-key order
 *   4. verify  per-table row counts AND content checksums match the source
 *   5. clean   drop the scratch schema, delete the dump files
 *
 * It measures how long dump and restore took (feeds the RTO estimate in
 * docs/runbook-recovery.md) and never modifies the source database.
 *
 * SAFETY: the dump files contain real rows (including password hashes). They are
 * written to the OS temp directory, never printed, and deleted at the end (also
 * on failure). Point DATABASE_URL at a NON-production database for the drill; a
 * production drill should be run against a restored copy instead.
 *
 * NOTE: this validates OUR ability to restore the data and the migration chain.
 * It does not validate the hosting provider's own backups (e.g. Supabase daily
 * backups / PITR) — restoring one of those into a scratch project is a separate,
 * manual step documented in the runbook.
 *
 * Usage:  DATABASE_URL=postgres://... node scripts/restore-drill.mjs
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";

// Keep timestamps/dates as the database's own text: parsing them into JS Dates
// would reinterpret naive timestamps in the local timezone and change them.
for (const oid of [1082, 1114, 1184]) pg.types.setTypeParser(oid, (value) => value);

const BASE_URL = process.env.DRILL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!BASE_URL) {
  console.error("Set DATABASE_URL (a NON-production database) before running the drill.");
  process.exit(2);
}
const SOURCE_SCHEMA = new URL(BASE_URL).searchParams.get("schema") ?? "public";
const SCRATCH_SCHEMA = `drill_${Date.now().toString(36)}`;
const dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-drill-"));

const withSchema = (url, schema) => {
  const u = new URL(url);
  u.searchParams.set("schema", schema);
  return u.toString();
};

const q = (ident) => `"${String(ident).replace(/"/g, '""')}"`;
const seconds = (ms) => (ms / 1000).toFixed(1);

async function listTables(client, schema) {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`,
    [schema],
  );
  return rows.map((r) => r.table_name);
}

/** Topological order so referenced tables are restored before the tables that reference them. */
async function insertionOrder(client, schema, tables) {
  const { rows } = await client.query(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = $1`,
    [schema],
  );
  const clean = (name) => name.replace(/^"?.*?"?\."?/, "").replace(/"/g, "");
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of rows) {
    const c = clean(child);
    const p = clean(parent);
    if (c !== p && deps.has(c) && deps.has(p)) deps.get(c).add(p);
  }
  const ordered = [];
  const done = new Set();
  while (ordered.length < tables.length) {
    const ready = tables.filter((t) => !done.has(t) && [...deps.get(t)].every((d) => done.has(d)));
    if (ready.length === 0) throw new Error("foreign-key cycle detected — cannot order the restore");
    for (const t of ready) {
      ordered.push(t);
      done.add(t);
    }
  }
  return ordered;
}

async function checksum(client, schema, table) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n,
            coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), 'empty') AS sum
       FROM ${q(schema)}.${q(table)} t`,
  );
  return rows[0];
}

const source = new pg.Client({ connectionString: BASE_URL });
const target = new pg.Client({ connectionString: BASE_URL });
let failures = 0;

try {
  await source.connect();
  await target.connect();

  // 1. dump ---------------------------------------------------------------
  const t0 = Date.now();
  const tables = await listTables(source, SOURCE_SCHEMA);
  const counts = {};
  for (const table of tables) {
    const { rows, fields } = await source.query(`SELECT * FROM ${q(SOURCE_SCHEMA)}.${q(table)}`);
    counts[table] = rows.length;
    fs.writeFileSync(
      path.join(dumpDir, `${table}.ndjson`),
      JSON.stringify({ columns: fields.map((f) => f.name) }) + "\n" + rows.map((r) => JSON.stringify(r)).join("\n"),
    );
  }
  const dumpMs = Date.now() - t0;
  console.log(`dump:    ${tables.length} tables, ${Object.values(counts).reduce((a, b) => a + b, 0)} rows in ${seconds(dumpMs)}s`);

  // 2. build scratch schema from migrations ------------------------------------
  const t1 = Date.now();
  await target.query(`CREATE SCHEMA ${q(SCRATCH_SCHEMA)}`);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: withSchema(BASE_URL, SCRATCH_SCHEMA), MIGRATE_DATABASE_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const buildMs = Date.now() - t1;
  console.log(`build:   scratch schema ${SCRATCH_SCHEMA} created from migrations in ${seconds(buildMs)}s`);

  // 3. restore ----------------------------------------------------------------
  const t2 = Date.now();
  const order = await insertionOrder(target, SCRATCH_SCHEMA, tables);
  await target.query(`SET search_path TO ${q(SCRATCH_SCHEMA)}`);
  for (const table of order) {
    const file = fs.readFileSync(path.join(dumpDir, `${table}.ndjson`), "utf8").split("\n");
    const { columns } = JSON.parse(file[0]);
    const rows = file.slice(1).filter(Boolean).map((l) => JSON.parse(l));
    if (rows.length === 0) continue;
    const colList = columns.map(q).join(", ");
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const params = [];
      const tuples = chunk.map((row) => {
        const placeholders = columns.map((c) => {
          const v = row[c];
          params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
          return `$${params.length}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      await target.query(`INSERT INTO ${q(SCRATCH_SCHEMA)}.${q(table)} (${colList}) VALUES ${tuples.join(", ")}`, params);
    }
  }
  const restoreMs = Date.now() - t2;
  console.log(`restore: ${order.length} tables restored in ${seconds(restoreMs)}s`);

  // 4. verify -----------------------------------------------------------------
  for (const table of tables) {
    const [a, b] = [await checksum(source, SOURCE_SCHEMA, table), await checksum(target, SCRATCH_SCHEMA, table)];
    const ok = a.n === b.n && a.sum === b.sum;
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${table.padEnd(24)} rows ${a.n} -> ${b.n}${ok ? "" : "  (content differs)"}`);
  }
  console.log(
    failures === 0
      ? `\nDRILL PASSED — every table restored identically. dump ${seconds(dumpMs)}s + schema ${seconds(buildMs)}s + restore ${seconds(restoreMs)}s = ${seconds(dumpMs + buildMs + restoreMs)}s end to end.`
      : `\nDRILL FAILED — ${failures} table(s) differ.`,
  );
} catch (error) {
  failures++;
  console.error("DRILL ERROR:", error instanceof Error ? error.message : error);
} finally {
  try {
    await target.query(`DROP SCHEMA IF EXISTS ${q(SCRATCH_SCHEMA)} CASCADE`);
  } catch {
    /* best effort */
  }
  await source.end().catch(() => {});
  await target.end().catch(() => {});
  fs.rmSync(dumpDir, { recursive: true, force: true });
}
process.exit(failures === 0 ? 0 : 1);
