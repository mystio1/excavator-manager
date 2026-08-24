import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { getMachinePerformanceSummary, listExcavators } from "@/lib/services/excavators";

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
