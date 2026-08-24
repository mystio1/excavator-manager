"use client";

import useSWR, { useSWRConfig } from "swr";
import { useState } from "react";
import { swrFetcher, apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StartWorkDialog } from "./start-work-dialog";
import { AddDailyLogDialog } from "./add-daily-log-dialog";
import { StopWorkDialog } from "./stop-work-dialog";
import { OperatorWorkRequestCard } from "./operator-work-request-card";
import { DeleteReadingButton } from "./delete-reading-button";

const LOG_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  APPROVED: { label: "Approved", className: "bg-working text-working-foreground" },
  PENDING: { label: "Pending", className: "bg-idle text-idle-foreground" },
  REJECTED: { label: "Rejected", className: "bg-destructive/10 text-destructive" },
};

type DailyLog = {
  id: string;
  date: Date;
  hoursWorked: number;
  status: string;
  source: string;
  operatorName: string | null;
};

type ActiveWork = {
  id: string;
  customer: { name: string };
  site: { name: string };
  startDate: Date;
  startHourMeter: number;
  totalHours: number;
  dailyLogs: DailyLog[];
} | null;

type OperatorWorkRequest = {
  id: string;
  status: string;
  startDate: Date;
  startHourMeter: number;
  endDate: Date | null;
  endHourMeter: number | null;
  attachment: string | null;
  siteName: string | null;
  dieselLiters: number | null;
  dieselDate: Date | null;
  notes: string | null;
  operator: { name: string };
};

type CustomerOption = { id: string; name: string; companyName: string | null };

function DailyLogRow({ excavatorId, log }: { excavatorId: string; log: DailyLog }) {
  const { mutate } = useSWRConfig();
  const badge = LOG_STATUS_BADGE[log.status] ?? LOG_STATUS_BADGE.APPROVED;
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  async function respond(action: "approve" | "reject") {
    setPending(action);
    try {
      await apiFetch(`/api/daily-logs/${log.id}/${action}`, { method: "POST" });
      await mutate(`/api/excavators/${excavatorId}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b py-2 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm">
          {formatDate(log.date)}
          {log.source === "OPERATOR" && <span className="ml-1.5 text-xs text-muted-foreground">(operator)</span>}
          {log.operatorName && <span className="ml-1.5 text-xs text-muted-foreground">— {log.operatorName}</span>}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{formatHours(log.hoursWorked)}</span>
          <Badge className={badge.className}>{badge.label}</Badge>
          <DeleteReadingButton logId={log.id} invalidateKey={`/api/excavators/${excavatorId}`} />
        </div>
      </div>
      {log.status === "PENDING" && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => respond("approve")}
            className="rounded-md bg-working px-3 py-1.5 text-xs font-semibold text-working-foreground disabled:opacity-60"
          >
            {pending === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => respond("reject")}
            className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-60"
          >
            {pending === "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      )}
    </div>
  );
}

export function CurrentWorkTab({
  excavatorId,
  currentHourMeter,
  currentOperatorName,
  defaultSiteName,
  activeWork,
  operatorWorkRequests,
}: {
  excavatorId: string;
  currentHourMeter: number;
  currentOperatorName: string | null;
  defaultSiteName: string | null;
  activeWork: ActiveWork;
  operatorWorkRequests: OperatorWorkRequest[];
}) {
  const { data } = useSWR<{ customers: CustomerOption[] }>(
    activeWork ? null : "/api/customers/options",
    swrFetcher,
  );

  if (!activeWork) {
    const customers = data?.customers ?? [];

    return (
      <div className="flex flex-col gap-4">
        {operatorWorkRequests.map((request) => (
          <OperatorWorkRequestCard key={request.id} request={request} customers={customers} />
        ))}
        {operatorWorkRequests.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <p className="text-muted-foreground">This machine is not on a job right now.</p>
              <StartWorkDialog
                excavatorId={excavatorId}
                currentHourMeter={currentHourMeter}
                currentOperatorName={currentOperatorName}
                defaultSiteName={defaultSiteName}
                customers={customers}
              />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <p className="text-muted-foreground">Customer</p>
            <p className="text-right font-semibold">{activeWork.customer.name}</p>
            <p className="text-muted-foreground">Site</p>
            <p className="text-right font-semibold">{activeWork.site.name}</p>
            <p className="text-muted-foreground">Operator</p>
            <p className="text-right font-semibold">{currentOperatorName ?? "—"}</p>
            <p className="text-muted-foreground">Started</p>
            <p className="text-right font-semibold">{formatDate(activeWork.startDate)}</p>
            <p className="text-muted-foreground">Hours So Far</p>
            <p className="text-right font-semibold">{formatHours(activeWork.totalHours)}</p>
          </div>

          <div className="flex gap-2 pt-2">
            <AddDailyLogDialog excavatorId={excavatorId} workSessionId={activeWork.id} currentHourMeter={currentHourMeter} />
            <StopWorkDialog excavatorId={excavatorId} workSessionId={activeWork.id} currentHourMeter={currentHourMeter} />
          </div>
        </CardContent>
      </Card>

      {activeWork.dailyLogs.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-muted-foreground">Daily Log</p>
            {activeWork.dailyLogs.map((log) => (
              <DailyLogRow key={log.id} excavatorId={excavatorId} log={log} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
