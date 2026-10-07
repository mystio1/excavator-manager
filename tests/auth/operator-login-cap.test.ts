import "../bills/pool";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { authenticateOperator } from "@/lib/services/auth";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";

/** One login attempt must not be able to trigger an unbounded number of bcrypt
 * comparisons, and when several operators share a mobile + PIN the oldest
 * account must win deterministically. */
describe("operator login: bounded, deterministic candidate set", () => {
  let t: TestTenant;
  const mobile = `9${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}`;
  const ids: string[] = [];

  beforeAll(async () => {
    t = await createTenant("op-login-cap");
    for (let i = 0; i < 7; i++) {
      const op = await db.operator.create({
        data: {
          businessId: t.businessId,
          name: `Decoy ${i}`,
          mobile,
          canLogin: true,
          pinHash: await hashPassword(`${1000 + i}`),
          createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
        },
      });
      ids.push(op.id);
    }
  }, 120_000);
  afterAll(async () => {
    if (t) await cleanupTenant(t.businessId);
    await db.$disconnect();
  }, 120_000);

  const req = () => new Request("https://x.test/api/auth/operator-login", { headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` } });

  it("logs in an operator among the 5 oldest accounts sharing the mobile", async () => {
    const res = await authenticateOperator(mobile, "1004", req());
    expect(res).toMatchObject({ ok: true, user: { id: ids[4] } });
  });

  it("does not even try accounts beyond the cap (the 6th and 7th never get compared)", async () => {
    expect(await authenticateOperator(mobile, "1005", req())).toMatchObject({ ok: false });
    expect(await authenticateOperator(mobile, "1006", req())).toMatchObject({ ok: false });
  });

  it("when two accounts share a PIN the OLDEST one is chosen, every time", async () => {
    const shared = `9${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}`;
    const hash = await hashPassword("4321");
    const older = await db.operator.create({ data: { businessId: t.businessId, name: "Older", mobile: shared, canLogin: true, pinHash: hash, createdAt: new Date("2026-01-01") } });
    await db.operator.create({ data: { businessId: t.businessId, name: "Newer", mobile: shared, canLogin: true, pinHash: hash, createdAt: new Date("2026-06-01") } });
    for (let i = 0; i < 3; i++) {
      expect(await authenticateOperator(shared, "4321", req())).toMatchObject({ ok: true, user: { id: older.id } });
    }
    void randomUUID;
  });
});
