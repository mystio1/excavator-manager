"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { GenerateDirectBillForm } from "./generate-direct-bill-form";
import Loading from "../../../loading";

type CustomerOption = { id: string; name: string; companyName: string | null };
type ExcavatorOption = { id: string; name: string; machineNumber: string | null };
type BankAccount = { id: string; label: string; isDefaultForGst: boolean; isDefaultForNonGst: boolean };

type BaseData = { customers: CustomerOption[] };
type FullData = BaseData & {
  excavators: ExcavatorOption[];
  bankAccounts: BankAccount[];
  businessGstNumber: string | null;
  nextNonGstNumber: string;
  customerName: string;
};

export default function NewDirectBillPage() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId") ?? "";

  const { data } = useSWR<FullData | BaseData>(
    `/api/bills/new/direct${customerId ? `?customerId=${customerId}` : ""}`,
    swrFetcher,
  );

  if (!data) return <Loading />;

  if (!customerId) {
    const { customers } = data;
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

  const full = data as FullData;

  return (
    <div>
      <PageHeader title={`Direct Bill — ${full.customerName}`} backHref="/bills/new/direct" />
      <div className="px-4 pb-6 md:px-8">
        <GenerateDirectBillForm
          customerId={customerId}
          excavators={full.excavators}
          bankAccounts={full.bankAccounts}
          businessGstNumber={full.businessGstNumber}
          nextNonGstNumber={full.nextNonGstNumber}
        />
      </div>
    </div>
  );
}
