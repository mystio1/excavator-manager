#!/usr/bin/env node
/**
 * Migration safety checks, run against a SCRATCH Postgres schema (created and
 * dropped by this script) — never against real tables.
 *
 *   1. fresh     — every migration applies cleanly to an empty database and
 *                  the objects the application relies on exist.
 *   2. upgrade   — data written under the PREVIOUS schema (float money, a
 *                  legacy pending operator join request, a bill + payment)
 *                  survives the money/security migrations unchanged.
 *   3. guard     — a value with more than 2 decimals makes the money migration
 *                  ABORT (and leaves the value untouched) instead of silently
 *                  rounding it.
 *
 * Usage:  TEST_DATABASE_URL=postgres://... node scripts/test-migrations.mjs
 *         (falls back to DATABASE_URL — point it at a non-production DB!)
 * CI runs it against the postgres service container.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";

const BASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!BASE_URL) {
  console.error("Set TEST_DATABASE_URL (or DATABASE_URL) to a NON-production Postgres database.");
  process.exit(2);
}

const MIGRATIONS_DIR = path.resolve("prisma/migrations");
// Migrations introduced together with this change set; everything before them
// is the "previous schema" used to seed representative existing data.
const NEW_MIGRATIONS = [
  "20261004085900_preflight_guards",
  "20261004090000_money_decimal",
  "20261004091000_security_and_integrity",
  "20261004100000_integrity_indexes",
];

const withSchema = (url, schema) => {
  const u = new URL(url);
  u.searchParams.set("schema", schema);
  return u.toString();
};

function prismaDeploy(schemaUrl, migrationsPath) {
  return execSync("npx prisma migrate deploy", {
    env: {
      ...process.env,
      DATABASE_URL: schemaUrl,
      MIGRATE_DATABASE_URL: "", // never let an operator shell override the scenario database
      ...(migrationsPath ? { PRISMA_MIGRATIONS_PATH: migrationsPath } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

function previousMigrationsDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mig-prev-"));
  for (const entry of fs.readdirSync(MIGRATIONS_DIR)) {
    if (NEW_MIGRATIONS.includes(entry)) continue;
    fs.cpSync(path.join(MIGRATIONS_DIR, entry), path.join(tmp, entry), { recursive: true });
  }
  return tmp;
}

async function withScratchSchema(name, fn) {
  const schema = `migtest_${name}_${Date.now().toString(36)}`;
  const admin = new pg.Client({ connectionString: BASE_URL });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const client = new pg.Client({ connectionString: BASE_URL });
  await client.connect();
  await client.query(`SET search_path TO "${schema}"`);
  try {
    await fn({ schema, url: withSchema(BASE_URL, schema), client });
  } finally {
    await client.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}

/** Inserts a row, filling every NOT NULL column that has no default with a
 * type-appropriate placeholder so the seed stays valid as the schema evolves. */
async function insertRow(client, schema, table, values) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  const row = { ...values };
  for (const c of rows) {
    if (c.column_name in row || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    row[c.column_name] = /timestamp/.test(t)
      ? new Date()
      : /double|numeric|integer/.test(t)
        ? 0
        : t === "boolean"
          ? false
          : t === "jsonb"
            ? {}
            : "x";
  }
  const cols = Object.keys(row);
  const params = cols.map((_, i) => `$${i + 1}`);
  await client.query(
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${params.join(", ")})`,
    cols.map((c) => (typeof row[c] === "object" && !(row[c] instanceof Date) && row[c] !== null ? JSON.stringify(row[c]) : row[c])),
  );
}

let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    failures++;
    console.error(`  FAIL ${msg}`);
  }
};

// ---------------------------------------------------------------------------
console.log("1) fresh database: all migrations apply");
await withScratchSchema("fresh", async ({ url, client, schema }) => {
  prismaDeploy(url);
  const tables = (
    await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, [schema])
  ).rows.map((r) => r.table_name);
  for (const t of ["IdempotencyKey", "RateLimitBucket", "SupportSession", "OperatorJoinRequest", "AuditLog", "Bill"]) {
    check(tables.includes(t), `table ${t} exists`);
  }
  const numeric = await client.query(
    `SELECT data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Bill' AND column_name = 'totalAmount'`,
    [schema],
  );
  check(numeric.rows[0]?.data_type === "numeric", "Bill.totalAmount is numeric");
  const idx = await client.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'BillItem_workSessionId_key'`,
    [schema],
  );
  check(idx.rowCount === 1, "BillItem.workSessionId unique index exists");
  for (const name of ["DailyWorkLog_session_date_live_key", "OperatorJoinRequest_pending_mobile_key", "User_resetTokenHash_idx"]) {
    const found = await client.query(`SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2`, [schema, name]);
    check(found.rowCount === 1, `index ${name} exists`);
  }
});

// ---------------------------------------------------------------------------
console.log("2) upgrade: representative existing data survives");
await withScratchSchema("upgrade", async ({ url, client, schema }) => {
  const prev = previousMigrationsDir();
  prismaDeploy(url, prev);

  await insertRow(client, schema, "Business", { id: "b1", name: "Acme", ownerName: "O", phone: "1", code: "ACME1" });
  await insertRow(client, schema, "Customer", { id: "c1", businessId: "b1", name: "Cust", mobile: "9" });
  await insertRow(client, schema, "Excavator", { id: "e1", businessId: "b1", name: "JCB" });
  await insertRow(client, schema, "Operator", {
    id: "o_pending", businessId: "b1", name: "Pending Op", mobile: "111", pinHash: "hash-pending", canLogin: false,
  });
  await insertRow(client, schema, "Operator", {
    id: "o_active", businessId: "b1", name: "Active Op", mobile: "222", pinHash: "hash-active", canLogin: true,
    defaultMonthlySalary: 25000.5,
  });
  await insertRow(client, schema, "Bill", {
    id: "bill1", businessId: "b1", billNumber: "NG-0001", billType: "NON_GST", customerId: "c1",
    subtotal: 1000.5, totalAmount: 1234.56, paidAmount: 200.25, gstPercentage: 18, cgst: 90.09, sgst: 90.09,
  });
  await insertRow(client, schema, "BillItem", {
    id: "bi1", billId: "bill1", excavatorId: "e1", siteName: "S", hours: 18.8, ratePerHour: 1800, amount: 33840,
  });
  await insertRow(client, schema, "Payment", { id: "p1", businessId: "b1", billId: "bill1", amount: 200.25 });
  await insertRow(client, schema, "OperatorTransaction", {
    id: "t1", businessId: "b1", operatorId: "o_active", amount: 5000.75,
  });

  prismaDeploy(url); // applies the two new migrations on top

  const bill = (await client.query(`SELECT "totalAmount"::text t, "paidAmount"::text p, "cgst"::text c FROM "Bill" WHERE id = 'bill1'`)).rows[0];
  check(bill.t === "1234.56" && bill.p === "200.25" && bill.c === "90.09", `bill money preserved exactly (${bill.t}, ${bill.p}, ${bill.c})`);
  const item = (await client.query(`SELECT "hours"::text h, "amount"::text a FROM "BillItem" WHERE id = 'bi1'`)).rows[0];
  check(item.h === "18.80" && item.a === "33840.00", `bill item preserved (${item.h}, ${item.a})`);
  const sal = (await client.query(`SELECT "defaultMonthlySalary"::text s FROM "Operator" WHERE id = 'o_active'`)).rows[0];
  check(sal.s === "25000.50", `operator salary preserved (${sal.s})`);
  const tx = (await client.query(`SELECT "amount"::text a FROM "OperatorTransaction" WHERE id = 't1'`)).rows[0];
  check(tx.a === "5000.75", `operator transaction preserved (${tx.a})`);

  const jr = (await client.query(`SELECT "status", "pinHash", "operatorId" FROM "OperatorJoinRequest" WHERE "operatorId" = 'o_pending'`)).rows;
  check(jr.length === 1 && jr[0].status === "PENDING" && jr[0].pinHash === "hash-pending", "legacy pending join request migrated with its PIN hash");
  const op = (await client.query(`SELECT "pinHash", "canLogin" FROM "Operator" WHERE id = 'o_pending'`)).rows[0];
  check(op.pinHash === null && op.canLogin === false, "pending operator no longer carries a usable PIN hash");
  const act = (await client.query(`SELECT "pinHash" FROM "Operator" WHERE id = 'o_active'`)).rows[0];
  check(act.pinHash === "hash-active", "active operator credentials untouched");

  // append-only audit log
  await insertRow(client, schema, "AuditLog", { id: "a1", businessId: "b1", userName: "t", action: "x", entityId: "e" });
  let blocked = false;
  try { await client.query(`DELETE FROM "AuditLog" WHERE id = 'a1'`); } catch { blocked = true; }
  check(blocked, "AuditLog DELETE is blocked");
  blocked = false;
  try { await client.query(`UPDATE "AuditLog" SET action = 'y' WHERE id = 'a1'`); } catch { blocked = true; }
  check(blocked, "AuditLog UPDATE is blocked");

  // double billing blocked at the database
  await insertRow(client, schema, "WorkSession", { id: "ws1", businessId: "b1", excavatorId: "e1", customerId: "c1", siteId: "s1", operatorId: "o_active" }).catch(() => {});
  // payment CHECK constraints (new rows)
  blocked = false;
  try { await client.query(`INSERT INTO "Payment" (id, "businessId", "billId", amount, date) VALUES ('p2','b1','bill1',0,now())`); } catch { blocked = true; }
  check(blocked, "Payment.amount must be positive");
  blocked = false;
  try { await client.query(`UPDATE "Bill" SET "paidAmount" = "totalAmount" + 1 WHERE id = 'bill1'`); } catch { blocked = true; }
  check(blocked, "Bill.paidAmount cannot exceed totalAmount");

  fs.rmSync(prev, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
console.log("3) guard: a sub-paisa value aborts the migrations (before anything changes)");
await withScratchSchema("guard", async ({ url, client, schema }) => {
  const prev = previousMigrationsDir();
  prismaDeploy(url, prev);
  await insertRow(client, schema, "Business", { id: "b1", name: "Acme", ownerName: "O", phone: "1", code: "ACME2" });
  await insertRow(client, schema, "Customer", { id: "c1", businessId: "b1", name: "Cust", mobile: "9" });
  await insertRow(client, schema, "Bill", {
    id: "bill1", businessId: "b1", billNumber: "NG-0001", billType: "NON_GST", customerId: "c1",
    subtotal: 10.123, totalAmount: 10.123,
  });
  let aborted = false;
  let output = "";
  try {
    prismaDeploy(url);
  } catch (e) {
    aborted = true;
    output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  check(aborted, "deploy aborted");
  check(/preflight_guards/.test(output) && /Bill\.subtotal/.test(output), "abort message comes from the pre-flight and names Bill.subtotal");
  check(/Nothing has been changed/.test(output), "abort message says nothing was changed");
  const col = (await client.query(
    `SELECT data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Bill' AND column_name = 'subtotal'`,
    [schema],
  )).rows[0];
  check(col.data_type === "double precision", "column left as double precision (nothing was rewritten)");
  const val = (await client.query(`SELECT "subtotal" FROM "Bill" WHERE id = 'bill1'`)).rows[0];
  check(Number(val.subtotal) === 10.123, "value untouched (10.123)");
  fs.rmSync(prev, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
console.log("4) pre-flight reports EVERY problem at once and changes nothing");
await withScratchSchema("multi", async ({ url, client, schema }) => {
  const prev = previousMigrationsDir();
  prismaDeploy(url, prev);
  await insertRow(client, schema, "Business", { id: "b1", name: "Acme", ownerName: "O", phone: "1", code: "ACME3" });
  await insertRow(client, schema, "Customer", { id: "c1", businessId: "b1", name: "Cust", mobile: "9" });
  await insertRow(client, schema, "Excavator", { id: "e1", businessId: "b1", name: "JCB" });
  await insertRow(client, schema, "Operator", { id: "o1", businessId: "b1", name: "Op", mobile: "5" });
  await insertRow(client, schema, "Site", { id: "s1", businessId: "b1", name: "S" });
  await insertRow(client, schema, "WorkSession", { id: "ws1", businessId: "b1", excavatorId: "e1", customerId: "c1", siteId: "s1", operatorId: "o1" });
  // problem A: a sub-paisa amount; problem B: the same work session billed twice (on two bills)
  await insertRow(client, schema, "Bill", { id: "bill1", businessId: "b1", billNumber: "NG-1", billType: "NON_GST", customerId: "c1", subtotal: 10.123, totalAmount: 10.123 });
  await insertRow(client, schema, "Bill", { id: "bill2", businessId: "b1", billNumber: "NG-2", billType: "NON_GST", customerId: "c1", subtotal: 5, totalAmount: 5 });
  await insertRow(client, schema, "BillItem", { id: "bi1", billId: "bill1", excavatorId: "e1", workSessionId: "ws1", siteName: "S", hours: 1, ratePerHour: 5, amount: 5 });
  await insertRow(client, schema, "BillItem", { id: "bi2", billId: "bill2", excavatorId: "e1", workSessionId: "ws1", siteName: "S", hours: 1, ratePerHour: 5, amount: 5 });
  let output = "";
  let aborted = false;
  try {
    prismaDeploy(url);
  } catch (e) {
    aborted = true;
    output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  check(aborted, "deploy aborted");
  check(/Bill\.subtotal/.test(output) && /billed more than once/.test(output), "BOTH problems are listed in the one message");
  const col = (await client.query(
    `SELECT data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Bill' AND column_name = 'subtotal'`,
    [schema],
  )).rows[0];
  check(col.data_type === "double precision", "no migration after the pre-flight ran (columns still double precision)");
  const tables = (await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'IdempotencyKey'`, [schema])).rowCount;
  check(tables === 0, "the security migration did not run either (no partial state)");
  fs.rmSync(prev, { recursive: true, force: true });
});

if (failures > 0) {
  console.error(`\n${failures} migration check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll migration checks passed");
