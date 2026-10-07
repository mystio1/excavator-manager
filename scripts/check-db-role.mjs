#!/usr/bin/env node
/**
 * Is the role the application connects as actually least-privilege? READ-ONLY.
 *
 *   npm run check:db-role            # checks the role in DATABASE_URL (what the running app uses)
 *
 * Run it with the app's DATABASE_URL after creating the role described in docs/security.md section 15. It reports
 * what the connection can do; it changes nothing and prints no credentials. Exit 1 when the role is NOT
 * least-privilege (owns the tables, can alter the schema, or can rewrite/delete/truncate the audit log).
 *
 * Expected for the application role: can SELECT/INSERT/UPDATE/DELETE the business tables, cannot UPDATE, DELETE or
 * TRUNCATE "AuditLog", does not own the tables, cannot create objects in the schema. The migration role
 * (MIGRATE_DATABASE_URL) is the one that owns the schema.
 */
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (the application's connection).");
  process.exit(2);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

try {
  const schema = new URL(url).searchParams.get("schema") ?? "public";
  const me = (await client.query("SELECT current_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super")).rows[0];
  console.log(`connected role: ${me.u === "postgres" ? "postgres (a privileged default role)" : "(a named role)"}; superuser: ${me.super}\n`);

  const priv = async (table, p) =>
    (await client.query("SELECT has_table_privilege(current_user, $1, $2) AS ok", [`"${schema}"."${table}"`, p])).rows[0].ok;

  for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) check(`can ${p} "Bill" (the app needs this)`, await priv("Bill", p));

  check('cannot UPDATE "AuditLog"', !(await priv("AuditLog", "UPDATE")));
  check('cannot DELETE "AuditLog"', !(await priv("AuditLog", "DELETE")));
  check('cannot TRUNCATE "AuditLog"', !(await priv("AuditLog", "TRUNCATE")));

  const owned = (
    await client.query(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind = 'r' AND pg_get_userbyid(c.relowner) = current_user`,
      [schema],
    )
  ).rows[0].n;
  check("owns none of the tables (an owner can disable triggers and alter the schema)", owned === 0, `${owned} owned`);

  const canCreate = (await client.query("SELECT has_schema_privilege(current_user, $1, 'CREATE') AS ok", [schema])).rows[0].ok;
  check("cannot create objects in the schema (no DDL)", !canCreate);
  check("is not a superuser", !me.super);

  console.log(
    failures === 0
      ? "\nleast-privilege: yes — this connection matches docs/security.md section 15"
      : `\nleast-privilege: NO — ${failures} check(s) failed. Create the role in docs/security.md section 15 and point DATABASE_URL at it (keep MIGRATE_DATABASE_URL on the owner).`,
  );
} finally {
  await client.end();
}
process.exit(failures === 0 ? 0 : 1);
