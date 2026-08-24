import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/session";
import { getComponentHistory } from "@/lib/services/serviceRecords";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";
import { formatCurrency } from "@/lib/utils/currency";

export default async function ComponentHistoryPage({
  params,
}: {
  params: Promise<{ id: string; componentId: string }>;
}) {
  const { id, componentId } = await params;
  const { businessId } = await requireBusiness();

  const component = await db.serviceItem.findFirst({ where: { id: componentId, businessId } });
  if (!component) notFound();

  const history = await getComponentHistory(businessId, id, componentId);

  return (
    <div>
      <PageHeader title={component.name} backHref={`/excavators/${id}?tab=service`} />
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
