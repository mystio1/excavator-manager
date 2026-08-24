import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { createCustomComponent } from "@/lib/services/serviceRecords";
import { addComponentSchema } from "@/lib/validation/serviceRecord";

export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = addComponentSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const component = await createCustomComponent(auth.session.businessId, parsed.data);
  return NextResponse.json({ component: { id: component.id, name: component.name, category: component.category } });
}
