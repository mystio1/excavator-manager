import { requireBusinessApi } from "@/lib/api-auth";
import { getBusinessSettings, listBankAccounts } from "@/lib/services/settings";
import { db } from "@/lib/db";
import { json, withApi } from "@/lib/with-api";

export const GET = withApi("settings.get", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId, userId } = auth.session;

  const [business, bankAccounts, user] = await Promise.all([
    getBusinessSettings(businessId),
    listBankAccounts(businessId),
    db.user.findFirst({ where: { id: userId, businessId }, select: { appPinHash: true } }),
  ]);

  return json({ business, bankAccounts, hasPin: !!user?.appPinHash });
});
