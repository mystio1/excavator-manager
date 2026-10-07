import { failureResponse } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { archiveBankAccount, updateBankAccount } from "@/lib/services/settings";
import { bankAccountSchema } from "@/lib/validation/settings";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

/** Edits a bank account (they print on new bills; bills already generated keep their own frozen copy). */
export const PATCH = withApi("settings.bank-accounts.update", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const input = await parseBody(req, bankAccountSchema);
  const result = await updateBankAccount(auth.session.businessId, auth.actor, id, input);
  if ("error" in result) return failureResponse(result);
  return json({ ok: true, account: result.account });
});

/** Archives (hides) the bank account. */
export const DELETE = withApi("settings.bank-accounts.archive", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await archiveBankAccount(auth.session.businessId, auth.actor, id);
  if ("error" in result) return failureResponse(result);
  return json({ ok: true });
});
