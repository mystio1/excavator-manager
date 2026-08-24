import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { setExcavatorSite } from "@/lib/services/excavators";
import { setExcavatorSiteSchema } from "@/lib/validation/excavator";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const parsed = setExcavatorSiteSchema.safeParse({ ...(await req.json()), excavatorId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await setExcavatorSite(auth.session.businessId, parsed.data.excavatorId, parsed.data.siteName);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
