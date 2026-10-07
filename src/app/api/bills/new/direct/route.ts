import { requireBusinessApi } from "@/lib/api-auth";
import { listCustomerOptions } from "@/lib/services/customers";
import { listExcavatorOptions } from "@/lib/services/excavators";
import { listBankAccounts, getBusinessSettings } from "@/lib/services/settings";
import { previewNextNonGstBillNumber } from "@/lib/services/bills";
import { json, withApi } from "@/lib/with-api";

export const GET = withApi("bills.new-direct-form", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId") ?? undefined;

  const customers = await listCustomerOptions(businessId);

  if (!customerId) {
    return json({ customers });
  }

  const [excavators, bankAccounts, business, nextNonGstNumber] = await Promise.all([
    listExcavatorOptions(businessId),
    listBankAccounts(businessId),
    getBusinessSettings(businessId),
    previewNextNonGstBillNumber(businessId),
  ]);
  const customer = customers.find((c) => c.id === customerId);

  return json({
    customers,
    excavators,
    bankAccounts,
    businessGstNumber: business.gstNumber,
    nextNonGstNumber,
    customerName: customer?.name ?? "",
  });
});
