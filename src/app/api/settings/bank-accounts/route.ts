import { requireBusinessApi } from "@/lib/api-auth";
import { addBankAccount } from "@/lib/services/settings";
import { bankAccountSchema } from "@/lib/validation/settings";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("settings.bank-accounts.create", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, bankAccountSchema);
  const account = await addBankAccount(auth.session.businessId, auth.actor, input);
  return json({ ok: true, account });
});
