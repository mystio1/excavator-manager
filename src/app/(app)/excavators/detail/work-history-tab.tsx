"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { listWorkHistory } from "@/lib/services/workSessions";
import { swrFetcher } from "@/lib/api-client";
import { formatDate, formatDateRange } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { DeleteReadingButton } from "./delete-reading-button";

type CustomerOption = { id: string; name: string; companyName: string | null };
type OperatorOption = { id: string; name: string };

export function WorkHistoryTab({ excavatorId }: { excavatorId: string }) {
  const searchParams = useSearchParams();
  const filters = {
    customerId: searchParams.get("customerId") ?? "",
    operatorId: searchParams.get("operatorId") ?? "",
    siteName: searchParams.get("site") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  };

  // Same SWR keys StartWorkDialog/AssignOperatorDialog/ApproveWorkRequestDialog
  // use for these — shares one cached fetch instead of each component
  // re-requesting the same option lists.
  const { data: customersData } = useSWR<{ customers: CustomerOption[] }>("/api/customers/options", swrFetcher);
  const { data: operatorsData } = useSWR<{ operators: OperatorOption[] }>("/api/operators/options", swrFetcher);

  const query = new URLSearchParams();
  if (filters.customerId) query.set("customerId", filters.customerId);
  if (filters.operatorId) query.set("operatorId", filters.operatorId);
  if (filters.siteName) query.set("site", filters.siteName);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);

  const { data: historyData } = useSWR<{ history: Awaited<ReturnType<typeof listWorkHistory>> }>(
    `/api/excavators/${excavatorId}/work-history${query.toString() ? `?${query.toString()}` : ""}`,
    swrFetcher,
  );
  const history = historyData?.history ?? [];
  const customers = customersData?.customers ?? [];
  const operators = operatorsData?.operators ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input type="hidden" name="tab" value="history" />
            <input type="hidden" name="id" value={excavatorId} />
            <NativeSelect name="customerId" defaultValue={filters.customerId} className="h-11">
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="operatorId" defaultValue={filters.operatorId} className="h-11">
              <option value="">All Operators</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
            {/* col-span-2 on mobile — half a 2-col mobile row clips a native
                date input's own "dd-mm-yyyy" text, leaving only the
                calendar icon visible. Visible labels too — an empty date
                input shows no placeholder text at all on some mobile
                browsers, so an aria-label alone left the field looking like
                a plain blank box with no hint of what it's for. */}
            <div className="col-span-2 flex flex-col gap-1 md:col-span-1">
              <Label htmlFor="wh-from-date" className="text-xs text-muted-foreground">
                From Date
              </Label>
              <Input id="wh-from-date" name="from" type="date" defaultValue={filters.from} className="h-11" />
            </div>
            <div className="col-span-2 flex flex-col gap-1 md:col-span-1">
              <Label htmlFor="wh-to-date" className="text-xs text-muted-foreground">
                To Date
              </Label>
              <Input id="wh-to-date" name="to" type="date" defaultValue={filters.to} className="h-11" />
            </div>
            <Input
              name="site"
              placeholder="Site"
              defaultValue={filters.siteName}
              className="col-span-2 h-11 md:col-span-3"
            />
            <Button type="submit" className="h-11">
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      {history.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">No work history found.</CardContent>
        </Card>
      )}

      {history.map((session) => (
        <Card key={session.id}>
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold">{session.customer.name}</p>
              {session.status === "ACTIVE" && <StatusBadge status="WORKING" />}
            </div>
            <p className="text-sm text-muted-foreground">{session.site.name}</p>
            <p className="text-sm">{formatDateRange(session.startDate, session.endDate)}</p>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Operator: {session.operator.name}</span>
              <span className="font-semibold">{formatHours(session.totalHours)}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-muted-foreground">Start Reading</span>
              <span className="text-right font-semibold">{formatHours(session.startHourMeter)}</span>
              <span className="text-muted-foreground">End Reading</span>
              <span className="text-right font-semibold">
                {session.endHourMeter != null ? formatHours(session.endHourMeter) : "—"}
              </span>
              {session.dieselLiters != null && (
                <>
                  <span className="text-muted-foreground">Diesel Taken</span>
                  <span className="text-right font-semibold">
                    {session.dieselLiters} L{session.dieselDate ? ` (${formatDate(session.dieselDate)})` : ""}
                  </span>
                </>
              )}
            </div>

            {session.dailyLogs.length > 0 && (
              <div className="mt-2 flex flex-col border-t pt-2">
                {session.dailyLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(log.date)}
                      {log.operatorName && ` — ${log.operatorName}`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold">{formatHours(log.hoursWorked)}</span>
                      <DeleteReadingButton
                        logId={log.id}
                        invalidateKey={`/api/excavators/${excavatorId}/work-history${query.toString() ? `?${query.toString()}` : ""}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
