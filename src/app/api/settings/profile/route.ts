import { requireBusinessApi } from "@/lib/api-auth";
import { updateBusinessProfile } from "@/lib/services/settings";
import { businessProfileSchema } from "@/lib/validation/settings";
import { json, parseBody, withApi } from "@/lib/with-api";

export const PATCH = withApi("settings.profile.update", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, businessProfileSchema);
  await updateBusinessProfile(auth.session.businessId, auth.actor, input);
  return json({ ok: true });
});
