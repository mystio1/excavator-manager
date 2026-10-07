import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import { getOperatorDetail } from "@/lib/services/operators";
import { listCategories, listTransactionsPage } from "@/lib/services/operatorTransactions";
import { computeSalaryForMonth, getLifetimeSalarySummary } from "@/lib/services/salary";
import { json, withApi } from "@/lib/with-api";

const MONTH_PARAM_RE = /^(\d{4})-(\d{1,2})$/;

/** `?id=<operator>&month=YYYY-M&limit=&cursor=` — `limit`/`cursor` page the
 * transaction list (response adds `nextCursor`; without `limit` a bounded
 * legacy page is returned). Everything else keeps its original shape. */
export const GET = withApi("operators.detail", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return errorResponse("BAD_REQUEST", "Missing operator id");

  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth();
  const monthParam = searchParams.get("month");
  if (monthParam) {
    const match = MONTH_PARAM_RE.exec(monthParam);
    const month = match ? Number(match[2]) : NaN;
    if (!match || month < 1 || month > 12) return errorResponse("BAD_REQUEST", "month must look like 2026-10");
    year = Number(match[1]);
    monthIndex = month - 1;
  }
  const salaryDate = new Date(year, monthIndex, 1);

  const detail = await getOperatorDetail(businessId, id);
  if (!detail) return errorResponse("NOT_FOUND", "Operator not found");

  const [categories, transactionPage, salary, lifetimeSalary] = await Promise.all([
    listCategories(businessId),
    listTransactionsPage(businessId, id, parsePagination(req)),
    computeSalaryForMonth(businessId, id, salaryDate.getFullYear(), salaryDate.getMonth()),
    getLifetimeSalarySummary(businessId, id),
  ]);

  return json({
    detail,
    categories,
    transactions: transactionPage.items,
    nextCursor: transactionPage.nextCursor,
    salary,
    lifetimeSalary,
  });
});
