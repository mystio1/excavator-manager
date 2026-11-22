import { requireBusinessApi } from "@/lib/api-auth";
import { updateDieselPrice } from "@/lib/services/settings";
import { dieselPriceSchema } from "@/lib/validation/settings";
import { json, parseBody, withApi } from "@/lib/with-api";

/** Sets (or clears, with null) what a litre of diesel costs the business. */
export const PATCH = withApi("settings.diesel-price.update", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, dieselPriceSchema);
  const after = await updateDieselPrice(auth.session.businessId, auth.actor, input.dieselPricePerLitre);
  return json({ dieselPricePerLitre: after.dieselPricePerLitre });
});
