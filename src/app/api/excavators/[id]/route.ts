import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { archiveExcavator, getExcavatorDetail, updateExcavator } from "@/lib/services/excavators";
import { listSiteOptions } from "@/lib/services/sites";
import { editExcavatorSchema } from "@/lib/validation/excavator";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const [detail, siteOptions] = await Promise.all([
    getExcavatorDetail(auth.session.businessId, id),
    listSiteOptions(auth.session.businessId),
  ]);
  if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ detail, siteOptions });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const parsed = editExcavatorSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  await updateExcavator(auth.session.businessId, id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  await archiveExcavator(auth.session.businessId, id);
  return NextResponse.json({ ok: true });
}
