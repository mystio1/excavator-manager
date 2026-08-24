import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { getOperatorDetail } from "@/lib/services/operators";
import { listCategories, listTransactions } from "@/lib/services/operatorTransactions";
import { computeSalaryForMonth } from "@/lib/services/salary";

export async function GET(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const detail = await getOperatorDetail(businessId, id);
  if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date();
  const monthParam = searchParams.get("month");
  const [monthYear, monthIndex] = monthParam ? monthParam.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const salaryDate = new Date(monthYear!, monthIndex! - 1, 1);

  const [categories, transactions, salary] = await Promise.all([
    listCategories(businessId),
    listTransactions(businessId, id),
    computeSalaryForMonth(businessId, id, salaryDate.getFullYear(), salaryDate.getMonth()),
  ]);

  return NextResponse.json({ detail, categories, transactions, salary });
}
