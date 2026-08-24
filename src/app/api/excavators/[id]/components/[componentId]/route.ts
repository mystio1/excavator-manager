import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { getComponentHistory } from "@/lib/services/serviceRecords";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id, componentId } = await params;

  const component = await db.serviceItem.findFirst({ where: { id: componentId, businessId: auth.session.businessId } });
  if (!component) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const history = await getComponentHistory(auth.session.businessId, id, componentId);
  return NextResponse.json({ component, history });
}
