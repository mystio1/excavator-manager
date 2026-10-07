import { requireBusinessApi } from "@/lib/api-auth";
import { runIdempotent } from "@/lib/idempotency";
import { parsePagination } from "@/lib/pagination";
import { countBillsByType, createBill, listBills } from "@/lib/services/bills";
import { generateBillSchema } from "@/lib/validation/bill";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("bills.create", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const input = await parseBody(req, generateBillSchema);

  // Exactly-once: a retry with the same Idempotency-Key replays the stored
  // response instead of creating a second bill.
  return runIdempotent(
    { req, businessId, actorId: auth.actor.id, operation: "bill.create", payload: input },
    async (tx) => {
      const result = await createBill(businessId, auth.actor, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return { ok: true, status: 201, body: result, resourceType: "Bill", resourceId: result.bill.id };
    },
  );
});

export const GET = withApi("bills.list", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId") ?? undefined;
  const filter = searchParams.get("filter");
  const isDirect = filter === "app" ? false : filter === "self" ? true : undefined;
  // Server-side search: covers every bill, not only the page the browser has loaded.
  const q = searchParams.get("q")?.trim().slice(0, 100) || undefined;
  const page = parsePagination(req);

  const [{ items, nextCursor }, counts] = await Promise.all([
    listBills(businessId, { customerId, isDirect, q }, page),
    countBillsByType(businessId, customerId),
  ]);

  return json({ bills: items, counts, nextCursor });
});
