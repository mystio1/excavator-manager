import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBusinessApi } from "@/lib/api-auth";
import { reorderExcavators } from "@/lib/services/excavators";

const schema = z.object({ orderedIds: z.array(z.string().min(1)).min(1).max(500) });

export async function PUT(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  await reorderExcavators(auth.session.businessId, parsed.data.orderedIds);
  return NextResponse.json({ ok: true });
}
