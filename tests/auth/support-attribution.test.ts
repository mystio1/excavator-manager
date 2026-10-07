import "../bills/pool";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { runWithContext } from "@/lib/request-context";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";

const getValidBusinessSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getValidBusinessSession: () => getValidBusinessSession(),
  getValidOperatorSession: vi.fn(),
}));

import { requireBusinessApi } from "@/lib/api-auth";

describe("support impersonation is attributed to SUPPORT, not the owner", () => {
  let t: TestTenant;
  beforeAll(async () => {
    t = await createTenant("support-attr");
  }, 60_000);
  afterAll(async () => {
    if (t) await cleanupTenant(t.businessId);
    await db.$disconnect();
  }, 60_000);

  const session = (supportSessionId: string | null) => ({
    userId: t.userId,
    businessId: t.businessId,
    businessName: "x",
    ownerName: "Real Owner",
    businessFrozen: false,
    supportSessionId,
  });

  it("an ordinary owner session produces an OWNER actor", async () => {
    getValidBusinessSession.mockResolvedValue(session(null));
    const auth = await runWithContext({ requestId: "req-owner-0001" }, () => requireBusinessApi());
    expect(auth.error).toBeNull();
    expect(auth.actor).toMatchObject({ type: "OWNER", id: t.userId, name: "Real Owner" });
  });

  it("an impersonated session produces a SUPPORT actor and tags every audit row with the support session", async () => {
    getValidBusinessSession.mockResolvedValue(session("sup-session-1"));
    await runWithContext({ requestId: "req-support-0001" }, async () => {
      const auth = await requireBusinessApi();
      expect(auth.actor).toMatchObject({ type: "SUPPORT", id: null });
      expect(auth.actor?.name).not.toBe("Real Owner");
      await recordAudit(db, {
        businessId: t.businessId,
        actor: auth.actor!,
        action: "bill.update",
        entityType: "Bill",
        entityId: "bill-x",
        before: { total: "1" },
        after: { total: "2" },
      });
    });
    const row = await db.auditLog.findFirstOrThrow({ where: { businessId: t.businessId, action: "bill.update" } });
    expect(row.actorType).toBe("SUPPORT");
    expect(row.userId).toBeNull(); // not attributed to the owner's user row
    expect(row.details).toMatchObject({ supportSessionId: "sup-session-1", onBehalfOfUserId: t.userId });
  });
});
