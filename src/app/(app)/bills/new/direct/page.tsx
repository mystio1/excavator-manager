import { requireBusiness } from "@/lib/session";
import { listCustomerOptions } from "@/lib/services/customers";
import { listExcavatorOptions } from "@/lib/services/excavators";
import { listBankAccounts, getBusinessSettings } from "@/lib/services/settings";
import { previewNextNonGstBillNumber } from "@/lib/services/bills";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { GenerateDirectBillForm } from "./generate-direct-bill-form";

export default async function NewDirectBillPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { businessId } = await requireBusiness();
  const { customerId } = await searchParams;
  const customers = await listCustomerOptions(businessId);

  if (!customerId) {
    return (
      <div>
        <PageHeader title="Direct Bill" backHref="/bills" />
        <div className="px-4 pb-6 md:px-8">
          <Card>
            <CardContent>
              <form method="get" className="flex flex-col gap-4">
                <div>
                  <p className="mb-2 text-base font-semibold">Select Customer</p>
                  {customers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Add a customer first.</p>
                  ) : (
                    <NativeSelect name="customerId" required defaultValue="">
                      <option value="" disabled>
                        Choose a customer
                      </option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.companyName ? ` (${c.companyName})` : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </div>
                <Button type="submit" size="lg" className="h-12 self-start text-base" disabled={customers.length === 0}>
                  Next
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const [excavators, bankAccounts, business, nextNonGstNumber, customer] = await Promise.all([
    listExcavatorOptions(businessId),
    listBankAccounts(businessId),
    getBusinessSettings(businessId),
    previewNextNonGstBillNumber(businessId),
    listCustomerOptions(businessId).then((list) => list.find((c) => c.id === customerId)),
  ]);

  return (
    <div>
      <PageHeader title={`Direct Bill — ${customer?.name ?? ""}`} backHref={`/bills/new/direct`} />
      <div className="px-4 pb-6 md:px-8">
        <GenerateDirectBillForm
          customerId={customerId}
          excavators={excavators}
          bankAccounts={bankAccounts}
          businessGstNumber={business.gstNumber}
          nextNonGstNumber={nextNonGstNumber}
        />
      </div>
    </div>
  );
}
