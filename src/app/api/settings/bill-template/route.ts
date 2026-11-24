import { requireBusinessApi } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { updateBillTemplate } from "@/lib/services/settings";
import { billTemplateSchema } from "@/lib/validation/settings";
import { json, parseBody, withApi } from "@/lib/with-api";

/** The bill layout (Bills tab): GET the current one, PATCH to change it for every bill. */
export const GET = withApi("settings.bill-template.get", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const business = await db.business.findUniqueOrThrow({ where: { id: auth.session.businessId }, select: { billTemplate: true } });
  return json({ billTemplate: business.billTemplate === "DAILY_SUMMARY" ? "DAILY_SUMMARY" : "STANDARD" });
});

export const PATCH = withApi("settings.bill-template.update", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const input = await parseBody(req, billTemplateSchema);
  const after = await updateBillTemplate(auth.session.businessId, auth.actor, input.billTemplate);
  return json(after);
});
