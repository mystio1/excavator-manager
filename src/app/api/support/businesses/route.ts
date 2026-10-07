import { requireSupportApi } from "@/lib/supportTokens";
import { listBusinessesForSupport } from "@/lib/services/support";
import { json, withApi } from "@/lib/with-api";

export const GET = withApi("support.businesses", async (req) => {
  const auth = await requireSupportApi(req);
  if (auth.error) return auth.error;

  const businesses = await listBusinessesForSupport();
  return json({ businesses });
});
