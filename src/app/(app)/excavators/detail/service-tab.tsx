"use client";

import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle } from "lucide-react";
import type {
  getPreviousServiceSummary,
  getReplacementHistory,
  listComponentCatalog,
  listServiceHistory,
} from "@/lib/services/serviceRecords";
import { swrFetcher } from "@/lib/api-client";
import { formatDate } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";
import { formatCurrency } from "@/lib/utils/currency";
import { Card, CardContent } from "@/components/ui/card";
import { AddServiceDialog } from "./add-service-dialog";

type ServiceStatus = {
  nextDueHour: number;
  dueInHours: number;
  overdue: boolean;
  dueSoon: boolean;
};

type ServiceTabData = {
  catalogGroups: Awaited<ReturnType<typeof listComponentCatalog>>;
  previousSummary: Awaited<ReturnType<typeof getPreviousServiceSummary>>;
  history: Awaited<ReturnType<typeof listServiceHistory>>;
  replacements: Awaited<ReturnType<typeof getReplacementHistory>>;
};

export function ServiceTab({
  excavatorId,
  currentHourMeter,
  serviceStatus,
}: {
  excavatorId: string;
  currentHourMeter: number;
  serviceStatus: ServiceStatus;
}) {
  const { data } = useSWR<ServiceTabData>(`/api/excavators/${excavatorId}/service-tab`, swrFetcher, {
    dedupingInterval: 15_000,
  });

  if (!data) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading…</CardContent></Card>;
  }

  const { catalogGroups, previousSummary, history, replacements } = data;
  const flatCatalog = catalogGroups.flatMap((g) => g.components.map((c) => ({ id: c.id, name: c.name, category: c.category })));
  const lastService = history[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Current Meter</p>
              <p className="font-bold">{formatHours(currentHourMeter)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last Service</p>
              <p className="font-bold">{lastService ? formatHours(lastService.hourMeterAtService) : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Next Service</p>
              <p className="font-bold">{formatHours(serviceStatus.nextDueHour)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Remaining</p>
              <p
                className={
                  serviceStatus.overdue
                    ? "font-bold text-destructive"
                    : serviceStatus.dueSoon
                      ? "font-bold text-idle-foreground"
                      : "font-bold"
                }
              >
                {serviceStatus.overdue
                  ? `Overdue by ${Math.abs(serviceStatus.dueInHours)} hrs`
                  : `${serviceStatus.dueInHours} hrs`}
              </p>
            </div>
          </div>

          <AddServiceDialog
            excavatorId={excavatorId}
            currentHourMeter={currentHourMeter}
            catalog={flatCatalog}
            previousItems={previousSummary.items}
            flagged={previousSummary.flagged}
          />
        </CardContent>
      </Card>

      {previousSummary.flagged.length > 0 && (
        <Card className="border-service/30 bg-service/5">
          <CardContent className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-service">
              <AlertTriangle className="size-4" />
              Needs Attention
            </p>
            {previousSummary.flagged.map((f) => (
              <p key={f.serviceItemId} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{f.name}</span> was marked &ldquo;{f.action}&rdquo; in
                the last service.
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">Component Status</p>
        <div className="flex flex-col gap-3">
          {catalogGroups.map((group) => (
            <Card key={group.category}>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-muted-foreground">{group.category}</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {group.components.map((c) => {
                    const lastItem = previousSummary.items.find((i) => i.serviceItemId === c.id);
                    return (
                      <Link
                        key={c.id}
                        href={`/excavators/detail/component?id=${excavatorId}&componentId=${c.id}`}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{lastItem ? lastItem.action : "Never serviced"}</span>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">Service History</p>
        {history.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">No service records yet.</CardContent>
          </Card>
        )}
        <div className="flex flex-col gap-2">
          {history.map((record) => (
            <Card key={record.id}>
              <CardContent>
                <details>
                  <summary className="flex cursor-pointer items-center justify-between text-sm">
                    <span className="font-semibold">
                      {formatDate(record.serviceDate)} — {formatHours(record.hourMeterAtService)}
                    </span>
                    <span className="font-semibold">{formatCurrency(record.cost)}</span>
                  </summary>
                  <div className="mt-2 flex flex-col gap-1 border-t pt-2">
                    {record.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span>{item.serviceItem.name}</span>
                        <span className="text-muted-foreground">
                          {item.action}
                          {item.cost > 0 ? ` · ${formatCurrency(item.cost)}` : ""}
                        </span>
                      </div>
                    ))}
                    {record.notes && <p className="mt-1 text-sm text-muted-foreground">{record.notes}</p>}
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {replacements.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">Replacement History</p>
          <div className="flex flex-col gap-2">
            {replacements.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold">{r.serviceItem.name}</p>
                    <p className="text-muted-foreground">
                      {formatDate(r.serviceRecord.serviceDate)} · {formatHours(r.serviceRecord.hourMeterAtService)}
                      {r.brand ? ` · ${r.brand}` : ""}
                    </p>
                  </div>
                  <span className="font-semibold">{formatCurrency(r.cost)}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
