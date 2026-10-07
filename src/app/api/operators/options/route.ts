import { requireBusinessApi } from "@/lib/api-auth";
import { listOperatorOptions } from "@/lib/services/operators";
import { json, withApi } from "@/lib/with-api";

export const GET = withApi("operators.options", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const operators = await listOperatorOptions(auth.session.businessId);
  return json({ operators });
});
