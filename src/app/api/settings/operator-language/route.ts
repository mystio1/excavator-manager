import { requireBusinessApi } from "@/lib/api-auth";
import { updateOperatorLanguage } from "@/lib/services/settings";
import { operatorLanguageSchema } from "@/lib/validation/settings";
import { json, parseBody, withApi } from "@/lib/with-api";

export const PATCH = withApi("settings.operator-language.update", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, operatorLanguageSchema);
  await updateOperatorLanguage(auth.session.businessId, auth.actor, input.operatorLanguage);
  return json({ ok: true });
});
