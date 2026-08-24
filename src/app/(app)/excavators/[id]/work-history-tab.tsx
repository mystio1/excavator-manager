import { listCustomerOptions } from "@/lib/services/customers";
import { listOperatorOptions } from "@/lib/services/operators";
import { listWorkHistory, type WorkHistoryFilters } from "@/lib/services/workSessions";
import { formatDate, formatDateRange } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { DeleteReadingButton } from "./delete-reading-button";

export async function WorkHistoryTab({
  businessId,
  excavatorId,
  filters,
}: {
  businessId: string;
  excavatorId: string;
  filters: WorkHistoryFilters;
}) {
  const [customers, operators, history] = await Promise.all([
    listCustomerOptions(businessId),
    listOperatorOptions(businessId),
    listWorkHistory(businessId, excavatorId, filters),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <input type="hidden" name="tab" value="history" />
            <NativeSelect name="customerId" defaultValue={filters.customerId ?? ""} className="h-11">
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="operatorId" defaultValue={filters.operatorId ?? ""} className="h-11">
              <option value="">All Operators</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
            <Input name="from" type="date" defaultValue={filters.from ?? ""} className="h-11" aria-label="From date" />
            <Input name="to" type="date" defaultValue={filters.to ?? ""} className="h-11" aria-label="To date" />
            <Input
              name="site"
              placeholder="Site"
              defaultValue={filters.siteName ?? ""}
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
                      <DeleteReadingButton logId={log.id} redirectTo={`/excavators/${excavatorId}?tab=history`} />
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
