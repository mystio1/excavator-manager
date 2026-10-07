import { requireOperatorApi } from "@/lib/api-auth";
import { updateOperatorOwnLanguage } from "@/lib/services/operators";
import { operatorLanguageSchema } from "@/lib/validation/settings";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("operator.language.update", async (req) => {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, operatorLanguageSchema);
  await updateOperatorOwnLanguage(auth.session.operatorId, input.operatorLanguage);
  return json({ ok: true });
});
