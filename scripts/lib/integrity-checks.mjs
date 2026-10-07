// Financial / referential integrity invariants, expressed as read-only SQL.
// Each check SELECTs the ids of rows that VIOLATE the rule — nothing else, so a
// report never contains names, amounts or contact data. Used by
// `npm run audit:integrity` (scripts/audit-integrity.mjs) and by
// tests/integrity/integrity.test.ts, which proves each check actually detects the
// corruption it claims to. The rules are explained in docs/invariants.md.
//
// $1 = optional business id (NULL = every business).

const SCOPE = (alias) => `($1::text IS NULL OR ${alias}."businessId" = $1)`;

/** taxable amount of a bill, as the application computes it before GST. */
const TAXABLE = `(CASE WHEN b."isDirect"
    THEN b."subtotal" + b."transportCharges"
    ELSE b."subtotal" + b."transportCharges" + b."fuelCharges" + b."extraCharges"
         + b."bucketCharge" + b."breakerCharge" - b."discount" END)`;
const TAX = `(COALESCE(b."cgst", 0) + COALESCE(b."sgst", 0) + COALESCE(b."igst", 0))`;

export const CHECKS = [
  {
    id: "bill-paid-equals-payments",
    severity: "error",
    title: "Bill.paidAmount equals the sum of its payments",
    sql: `SELECT b.id FROM "Bill" b
          LEFT JOIN (SELECT "billId", SUM("amount") AS s FROM "Payment" GROUP BY "billId") p ON p."billId" = b.id
          WHERE b."paidAmount" <> COALESCE(p.s, 0) AND ${SCOPE("b")}`,
  },
  {
    id: "bill-status-matches-amounts",
    severity: "error",
    title: "Bill.status (UNPAID/PARTIAL/PAID) agrees with paidAmount vs totalAmount",
    sql: `SELECT b.id FROM "Bill" b
          WHERE b."status" <> (CASE WHEN b."paidAmount" <= 0 THEN 'UNPAID'
                                    WHEN b."paidAmount" >= b."totalAmount" THEN 'PAID'
                                    ELSE 'PARTIAL' END)
            AND ${SCOPE("b")}`,
  },
  {
    id: "bill-paid-within-total",
    severity: "error",
    title: "0 <= paidAmount <= totalAmount on every bill, and every payment is positive",
    sql: `SELECT b.id FROM "Bill" b
          WHERE (b."paidAmount" < 0 OR b."paidAmount" > b."totalAmount" OR b."totalAmount" < 0) AND ${SCOPE("b")}
          UNION
          SELECT p.id FROM "Payment" p WHERE p."amount" <= 0 AND ${SCOPE("p")}`,
  },
  {
    id: "bill-subtotal-equals-items",
    severity: "error",
    title: "A normal bill's subtotal equals the sum of its line amounts",
    sql: `SELECT b.id FROM "Bill" b
          WHERE NOT b."isDirect"
            AND b."subtotal" <> COALESCE((SELECT SUM(i."amount") FROM "BillItem" i WHERE i."billId" = b.id), 0)
            AND ${SCOPE("b")}`,
  },
  {
    id: "bill-item-amount",
    severity: "error",
    title: "Every line amount equals hours x rate, rounded to 2 decimals",
    sql: `SELECT i.id FROM "BillItem" i JOIN "Bill" b ON b.id = i."billId"
          WHERE ROUND(i."hours" * i."ratePerHour", 2) <> i."amount" AND ${SCOPE("b")}`,
  },
  {
    id: "bill-total-formula",
    severity: "error",
    title: "totalAmount = taxable amount + GST (- diesel advance on direct bills)",
    sql: `SELECT b.id FROM "Bill" b
          WHERE b."totalAmount" <> ${TAXABLE} + ${TAX} - (CASE WHEN b."isDirect" THEN COALESCE(b."dieselAdvance", 0) ELSE 0 END)
            AND ${SCOPE("b")}`,
  },
  {
    id: "direct-bill-subtotal",
    severity: "error",
    title: "A direct bill's subtotal equals its bucket + breaker lines",
    sql: `SELECT b.id FROM "Bill" b
          WHERE b."isDirect"
            AND b."subtotal" <> ROUND(COALESCE(b."bucketHours" * b."bucketRate", 0), 2)
                              + ROUND(COALESCE(b."breakerHours" * b."breakerRate", 0), 2)
            AND ${SCOPE("b")}`,
  },
  {
    id: "bill-gst-amount",
    severity: "error",
    title: "GST bills carry CGST+SGST = rate x taxable amount; non-GST bills carry none",
    sql: `SELECT b.id FROM "Bill" b
          WHERE ${SCOPE("b")} AND (
            (b."billType" = 'GST' AND COALESCE(b."gstPercentage", 0) > 0
              AND COALESCE(b."cgst", 0) + COALESCE(b."sgst", 0) <> ROUND(${TAXABLE} * b."gstPercentage" / 100, 2))
            OR (b."billType" = 'NON_GST' AND ${TAX} <> 0))`,
  },
  {
    id: "payment-tenant",
    severity: "error",
    title: "A payment belongs to the same business as its bill",
    sql: `SELECT p.id FROM "Payment" p JOIN "Bill" b ON b.id = p."billId"
          WHERE p."businessId" <> b."businessId" AND ${SCOPE("b")}`,
  },
  {
    id: "bill-parents-tenant",
    severity: "error",
    title: "A bill's customer, bank account and machine belong to the bill's business",
    sql: `SELECT b.id FROM "Bill" b
          LEFT JOIN "Customer" c ON c.id = b."customerId"
          LEFT JOIN "BankAccount" ba ON ba.id = b."bankAccountId"
          LEFT JOIN "Excavator" e ON e.id = b."excavatorId"
          WHERE ${SCOPE("b")} AND (
            c."businessId" <> b."businessId"
            OR (b."bankAccountId" IS NOT NULL AND ba."businessId" <> b."businessId")
            OR (b."excavatorId" IS NOT NULL AND e."businessId" <> b."businessId"))`,
  },
  {
    id: "bill-item-tenant",
    severity: "error",
    title: "A bill line's machine and work record belong to the bill's business",
    sql: `SELECT i.id FROM "BillItem" i
          JOIN "Bill" b ON b.id = i."billId"
          JOIN "Excavator" e ON e.id = i."excavatorId"
          LEFT JOIN "WorkSession" s ON s.id = i."workSessionId"
          WHERE ${SCOPE("b")} AND (e."businessId" <> b."businessId"
            OR (i."workSessionId" IS NOT NULL AND s."businessId" <> b."businessId"))`,
  },
  {
    id: "work-session-tenant",
    severity: "error",
    title: "A work record's machine, customer, site and operator belong to its business",
    sql: `SELECT s.id FROM "WorkSession" s
          JOIN "Excavator" e ON e.id = s."excavatorId"
          JOIN "Customer" c ON c.id = s."customerId"
          JOIN "Site" si ON si.id = s."siteId"
          JOIN "Operator" o ON o.id = s."operatorId"
          WHERE ${SCOPE("s")} AND (e."businessId" <> s."businessId" OR c."businessId" <> s."businessId"
            OR si."businessId" <> s."businessId" OR o."businessId" <> s."businessId")`,
  },
  {
    id: "operator-transaction-tenant",
    severity: "error",
    title: "An operator money entry belongs to the same business as its operator",
    sql: `SELECT t.id FROM "OperatorTransaction" t JOIN "Operator" o ON o.id = t."operatorId"
          WHERE t."businessId" <> o."businessId"
            AND ($1::text IS NULL OR t."businessId" = $1 OR o."businessId" = $1)`,
  },
  {
    id: "operator-assignment-tenant",
    severity: "error",
    title: "A machine-operator assignment links a machine and an operator of its own business",
    sql: `SELECT a.id FROM "OperatorAssignment" a
          JOIN "Excavator" e ON e.id = a."excavatorId"
          JOIN "Operator" o ON o.id = a."operatorId"
          WHERE (e."businessId" <> a."businessId" OR o."businessId" <> a."businessId")
            AND ($1::text IS NULL OR a."businessId" = $1 OR e."businessId" = $1 OR o."businessId" = $1)`,
  },
  {
    id: "work-request-tenant",
    severity: "error",
    title: "An operator work request links a machine, operator and work record of its own business",
    sql: `SELECT w.id FROM "OperatorWorkRequest" w
          JOIN "Excavator" e ON e.id = w."excavatorId"
          JOIN "Operator" o ON o.id = w."operatorId"
          LEFT JOIN "WorkSession" s ON s.id = w."workSessionId"
          WHERE (e."businessId" <> w."businessId" OR o."businessId" <> w."businessId"
                 OR (w."workSessionId" IS NOT NULL AND s."businessId" <> w."businessId"))
            AND ($1::text IS NULL OR w."businessId" = $1 OR e."businessId" = $1 OR o."businessId" = $1)`,
  },
  {
    id: "service-and-expense-tenant",
    severity: "error",
    title: "Service records and machine expenses belong to the same business as their machine",
    sql: `SELECT r.id FROM "ServiceRecord" r JOIN "Excavator" e ON e.id = r."excavatorId"
          WHERE r."businessId" <> e."businessId" AND ($1::text IS NULL OR r."businessId" = $1 OR e."businessId" = $1)
          UNION
          SELECT x.id FROM "ExcavatorExpense" x JOIN "Excavator" e ON e.id = x."excavatorId"
          WHERE x."businessId" <> e."businessId" AND ($1::text IS NULL OR x."businessId" = $1 OR e."businessId" = $1)`,
  },
  {
    id: "machine-current-links-tenant",
    severity: "error",
    title: "A machine's current operator and current site belong to the machine's business",
    sql: `SELECT e.id FROM "Excavator" e
          LEFT JOIN "Operator" o ON o.id = e."currentOperatorId"
          LEFT JOIN "Site" s ON s.id = e."currentSiteId"
          WHERE ${SCOPE("e")} AND ((e."currentOperatorId" IS NOT NULL AND o."businessId" <> e."businessId")
                                   OR (e."currentSiteId" IS NOT NULL AND s."businessId" <> e."businessId"))`,
  },
  {
    id: "transaction-category-tenant",
    severity: "error",
    title: "An operator money entry uses a category of its own business",
    sql: `SELECT t.id FROM "OperatorTransaction" t JOIN "TransactionCategory" c ON c.id = t."categoryId"
          WHERE t."businessId" <> c."businessId" AND ($1::text IS NULL OR t."businessId" = $1 OR c."businessId" = $1)`,
  },
  {
    id: "join-request-references",
    severity: "error",
    title: "A join request's operator and decider exist and belong to its business (these two columns have no foreign key)",
    sql: `SELECT j.id FROM "OperatorJoinRequest" j
          LEFT JOIN "Operator" o ON o.id = j."operatorId"
          LEFT JOIN "User" u ON u.id = j."decidedBy"
          WHERE ${SCOPE("j")} AND (
            (j."operatorId" IS NOT NULL AND (o.id IS NULL OR o."businessId" <> j."businessId"))
            OR (j."decidedBy" IS NOT NULL AND (u.id IS NULL OR u."businessId" <> j."businessId")))`,
  },
  {
    id: "billed-session-completed",
    severity: "warn",
    title: "A work record that has been billed is a completed one",
    sql: `SELECT s.id FROM "WorkSession" s
          WHERE s."status" <> 'COMPLETED'
            AND EXISTS (SELECT 1 FROM "BillItem" i WHERE i."workSessionId" = s.id)
            AND ${SCOPE("s")}`,
  },
  {
    id: "one-active-session-per-machine",
    severity: "error",
    title: "A machine has at most one ACTIVE work record",
    sql: `SELECT s.id FROM "WorkSession" s
          WHERE s."status" = 'ACTIVE' AND ${SCOPE("s")}
            AND EXISTS (SELECT 1 FROM "WorkSession" o
                        WHERE o."excavatorId" = s."excavatorId" AND o."status" = 'ACTIVE' AND o.id <> s.id)`,
  },
  {
    id: "completed-session-shape",
    severity: "warn",
    title: "A completed work record has an end date and a closing hour-meter reading >= the opening one",
    sql: `SELECT s.id FROM "WorkSession" s
          WHERE s."status" = 'COMPLETED' AND ${SCOPE("s")}
            AND (s."endDate" IS NULL OR s."endHourMeter" IS NULL OR s."endHourMeter" < s."startHourMeter" OR s."totalHours" < 0)`,
  },
];

/** Controls the database itself must still have. Reported as "missing"/"not validated". */
export const CONTROL_CHECKS = [
  {
    id: "control-audit-log-append-only",
    severity: "error",
    title: "AuditLog append-only triggers exist AND are enabled (a DISABLE TRIGGER bypass is caught)",
    sql: `SELECT t.tgname AS id FROM (VALUES ('audit_log_no_update_delete'), ('audit_log_no_truncate')) AS t(tgname)
          WHERE NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgname = t.tgname AND NOT g.tgisinternal AND g.tgenabled <> 'D')`,
  },
  {
    id: "control-check-constraints-present",
    severity: "error",
    title: "Payment/Bill CHECK constraints exist",
    sql: `SELECT c.name AS id FROM (VALUES ('Payment_amount_positive'), ('Bill_paid_non_negative'), ('Bill_paid_within_total')) AS c(name)
          WHERE NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conname = c.name)`,
  },
  {
    id: "control-check-constraints-validated",
    severity: "warn",
    title: "CHECK constraints are validated against legacy rows (run ALTER TABLE ... VALIDATE CONSTRAINT once the data is clean)",
    sql: `SELECT k.conname AS id FROM pg_constraint k
          WHERE k.conname IN ('Payment_amount_positive', 'Bill_paid_non_negative', 'Bill_paid_within_total') AND NOT k.convalidated`,
  },
  {
    id: "control-foreign-keys-validated",
    severity: "warn",
    title: "Every foreign key is validated (none left NOT VALID by a restore or manual change)",
    sql: `SELECT k.conname AS id FROM pg_constraint k
          JOIN pg_namespace n ON n.oid = k.connamespace
          WHERE k.contype = 'f' AND NOT k.convalidated AND n.nspname = current_schema()`,
  },
  {
    id: "control-bill-item-session-unique",
    severity: "error",
    title: "BillItem.workSessionId is unique (a work record can be billed once)",
    sql: `SELECT 'BillItem_workSessionId_key' AS id
          WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'BillItem_workSessionId_key')`,
  },
];

const SAMPLE = 5;

const quote = (ident) => `"${String(ident).replace(/"/g, '""')}"`;

/** Rows whose foreign-key value points at a row that does not exist. The database normally makes this
 * impossible; it CAN happen after a restore with constraints disabled (session_replication_role = replica),
 * a manual `ALTER TABLE ... DISABLE TRIGGER ALL`, or a bad data fix. Built from the catalog so a new table or
 * relation is covered automatically. Always global (an orphan is wrong wherever it is). */
export async function orphanCheck(client, sample = SAMPLE) {
  const { rows: fks } = await client.query(`
    SELECT con.conname,
           cl.relname AS child, pl.relname AS parent,
           (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attnum = con.conkey[1]) AS child_col,
           (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = con.confrelid AND a.attnum = con.confkey[1]) AS parent_col
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_class pl ON pl.oid = con.confrelid
      JOIN pg_namespace n ON n.oid = con.connamespace
     WHERE con.contype = 'f' AND array_length(con.conkey, 1) = 1 AND n.nspname = current_schema()
     ORDER BY cl.relname, con.conname`);
  let count = 0;
  const found = [];
  for (const fk of fks) {
    const { rows } = await client.query(
      `SELECT c.ctid::text AS ref FROM ${quote(fk.child)} c
        WHERE c.${quote(fk.child_col)} IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM ${quote(fk.parent)} p WHERE p.${quote(fk.parent_col)} = c.${quote(fk.child_col)})
        LIMIT 1000`,
    );
    count += rows.length;
    for (const r of rows) if (found.length < sample) found.push(`${fk.child}.${fk.child_col} -> ${fk.parent} (row ${r.ref})`);
  }
  return {
    id: "no-orphan-foreign-keys",
    title: `No row points at a missing parent (${fks.length} foreign keys scanned)`,
    severity: "error",
    count,
    sample: found,
  };
}

/** Runs every check on `client` (a connected pg client) inside a READ ONLY
 * transaction. Returns [{ id, title, severity, count, sample }].
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} client
 * @param {{ businessId?: string | null, sample?: number }} [options]
 * @returns {Promise<{ id: string, title: string, severity: string, count: number, sample: string[] }[]>} */
export async function runChecks(client, { businessId = null, sample = SAMPLE } = {}) {
  const results = [];
  await client.query("BEGIN READ ONLY");
  try {
    for (const check of [...CHECKS, ...CONTROL_CHECKS]) {
      // Control checks reference no parameter; pg rejects unused bind values.
      const { rows } = await client.query(check.sql, check.sql.includes("$1") ? [businessId] : []);
      results.push({
        id: check.id,
        title: check.title,
        severity: check.severity,
        count: rows.length,
        sample: rows.slice(0, sample).map((r) => r.id),
      });
    }
    results.push(await orphanCheck(client, sample));
  } finally {
    await client.query("ROLLBACK");
  }
  return results;
}
