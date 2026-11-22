import { requireBusinessApi } from "@/lib/api-auth";
import { getRecordedHoursForBilling } from "@/lib/services/siteAnalysis";
import { directBillHoursQuerySchema } from "@/lib/validation/bill";
import { json, withApi } from "@/lib/with-api";

/** `?customerId=&excavatorId=&from=yyyy-MM-dd&to=yyyy-MM-dd` -> the Bucket / Breaker hours Site
 * Analysis has recorded for that machine and customer in the period (not yet billed), so a direct
 * bill starts from the real figures instead of hours typed from memory. Read only. */
export const GET = withApi("bills.direct-hours", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const query = directBillHoursQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json(await getRecordedHoursForBilling(auth.session.businessId, query));
});
