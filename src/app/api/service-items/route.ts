import { requireBusinessApi } from "@/lib/api-auth";
import { json, parseBody, withApi } from "@/lib/with-api";
import { createCustomComponent } from "@/lib/services/serviceRecords";
import { addComponentSchema } from "@/lib/validation/serviceRecord";

export const POST = withApi("serviceItems.create", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, addComponentSchema);
  const component = await createCustomComponent(auth.session.businessId, input);
  return json({ component: { id: component.id, name: component.name, category: component.category } });
});
