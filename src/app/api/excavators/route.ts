import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { createExcavator, getMachinePerformanceSummary, listExcavators } from "@/lib/services/excavators";
import { addExcavatorSchema } from "@/lib/validation/excavator";

export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [excavators, machinePerformance] = await Promise.all([
    listExcavators(businessId),
    getMachinePerformanceSummary(businessId),
  ]);

  return NextResponse.json({ excavators, machinePerformance });
}

export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = addExcavatorSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const excavator = await createExcavator(auth.session.businessId, parsed.data);
  return NextResponse.json({ excavator });
}
