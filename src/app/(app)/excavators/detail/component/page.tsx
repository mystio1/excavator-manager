"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { getComponentHistory } from "@/lib/services/serviceRecords";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";
import { formatCurrency } from "@/lib/utils/currency";
import Loading from "../../../loading";

type ComponentData = {
  component: { id: string; name: string; category: string };
  history: Awaited<ReturnType<typeof getComponentHistory>>;
};

export default function ComponentHistoryPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const componentId = searchParams.get("componentId") ?? "";

  const { data } = useSWR<ComponentData>(
    id && componentId ? `/api/excavators/${id}/components/${componentId}` : null,
    swrFetcher,
  );

  if (!data) return <Loading />;
  const { component, history } = data;

  return (
    <div>
      <PageHeader title={component.name} backHref={`/excavators/detail?id=${id}&tab=service`} />
      <div className="flex flex-col gap-3 px-4 pb-6 md:px-8">
        <Card>
          <CardContent className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Category</span>
            <span className="font-semibold">{component.category}</span>
          </CardContent>
        </Card>

        {history.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No service history for this component yet.
            </CardContent>
          </Card>
        )}

        {history.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{item.action}</p>
                <span className="text-sm text-muted-foreground">
                  {formatDate(item.serviceRecord.serviceDate)} · {formatHours(item.serviceRecord.hourMeterAtService)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{item.brand ?? ""}</span>
                {item.cost > 0 && <span className="font-semibold text-foreground">{formatCurrency(item.cost)}</span>}
              </div>
              {item.notes && <p className="text-sm text-muted-foreground">{item.notes}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
