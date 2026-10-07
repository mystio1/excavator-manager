"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { CheckCircle2 } from "lucide-react";
import type { listPendingLogs } from "@/lib/services/workSessions";
import type { listPendingWorkRequests } from "@/lib/services/operatorWorkRequests";
import type { listCustomerOptions } from "@/lib/services/customers";
import type { listPendingJoinRequests } from "@/lib/services/operators";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import type { Plain } from "@/lib/plain";
import { ApproveWorkRequestDialog } from "../../excavators/detail/approve-work-request-dialog";
import { RejectWorkRequestDialog } from "../../excavators/detail/reject-work-request-dialog";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";
import { JoinRequestCard } from "./join-request-card";
import Loading from "../../loading";

type ApprovalsData = {
  logs: Plain<Awaited<ReturnType<typeof listPendingLogs>>>;
  workRequests: Plain<Awaited<ReturnType<typeof listPendingWorkRequests>>>;
  customers: Plain<Awaited<ReturnType<typeof listCustomerOptions>>>;
  // Absent from an older server's response.
  joinRequests?: Plain<Awaited<ReturnType<typeof listPendingJoinRequests>>>;
};

function LogApproveReject({ logId, version }: { logId: string; version: number }) {
  const { mutate } = useSWRConfig();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "approve" | "reject") {
    setPending(action);
    setError(null);
    try {
      // expectedVersion turns a double review / concurrent edit into a clear
      // 409 instead of a silent success.
      await apiFetch(`/api/daily-logs/${logId}/${action}?expectedVersion=${version}`, { method: "POST" });
      await mutate("/api/approvals");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this reading");
      await mutate("/api/approvals");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => respond("approve")}
          className="flex-1 rounded-lg bg-working py-2.5 text-sm font-semibold text-working-foreground disabled:opacity-60"
        >
          {pending === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => respond("reject")}
          className="flex-1 rounded-lg bg-destructive/10 py-2.5 text-sm font-semibold text-destructive disabled:opacity-60"
        >
          {pending === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </div>
  );
}

export default function PendingApprovalsPage() {
  const { data } = useSWR<ApprovalsData>("/api/approvals", swrFetcher, { dedupingInterval: 15_000 });

  if (!data) return <Loading />;
  const { logs, workRequests, customers } = data;
  const joinRequests = data.joinRequests ?? [];

  return (
    <div>
      <PageHeader title="Pending Approvals" />
      <div className="flex flex-col gap-3 px-4 pb-6 md:px-8">
        {logs.length === 0 && workRequests.length === 0 && joinRequests.length === 0 && (
          <EmptyState
            icon={CheckCircle2}
            title="All Caught Up"
            description="No operator join requests, readings or jobs are waiting for approval."
          />
        )}
        {joinRequests.map((req) => (
          <JoinRequestCard key={req.id} request={req} />
        ))}
        {workRequests.map((req) => (
          <Card key={req.id} className="border-primary/40 bg-primary/5">
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {req.excavator.name}
                    {req.excavator.machineNumber ? ` (${req.excavator.machineNumber})` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">Reported by {req.operator.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-sm">
                <p className="text-muted-foreground">Started</p>
                <p className="text-right font-semibold">{formatDateTime(req.startDate)}</p>
                <p className="text-muted-foreground">Starting Reading</p>
                <p className="text-right font-semibold">{formatHours(req.startHourMeter)}</p>
                <p className="text-muted-foreground">Ended</p>
                <p className="text-right font-semibold">{req.endDate ? formatDateTime(req.endDate) : "—"}</p>
                <p className="text-muted-foreground">Ending Reading</p>
                <p className="text-right font-semibold">{formatHours(req.endHourMeter ?? 0)}</p>
                {req.siteName && (
                  <>
                    <p className="text-muted-foreground">Site</p>
                    <p className="text-right font-semibold">{req.siteName}</p>
                  </>
                )}
                {req.attachment && (
                  <>
                    <p className="text-muted-foreground">Attachment</p>
                    <p className="text-right font-semibold">{req.attachment}</p>
                  </>
                )}
                {req.dieselLiters != null && (
                  <>
                    <p className="text-muted-foreground">Diesel</p>
                    <p className="text-right font-semibold">
                      {req.dieselLiters} L{req.dieselDate ? ` (${formatDateTime(req.dieselDate)})` : ""}
                    </p>
                  </>
                )}
                {req.notes && (
                  <>
                    <p className="text-muted-foreground">Note</p>
                    <p className="text-right font-semibold">{req.notes}</p>
                  </>
                )}
              </div>
              {req.endHourMeter != null && (
                <div className="flex gap-2 pt-1">
                  <RejectWorkRequestDialog requestId={req.id} />
                  <ApproveWorkRequestDialog
                    requestId={req.id}
                    operatorName={req.operator.name}
                    startHourMeter={req.startHourMeter}
                    endHourMeter={req.endHourMeter}
                    attachment={req.attachment}
                    siteName={req.siteName}
                    dieselLiters={req.dieselLiters}
                    dieselDate={req.dieselDate}
                    notes={req.notes}
                    customers={customers}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {logs.map((log) => (
          <Card key={log.id}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {log.workSession.excavator.name}
                    {log.workSession.excavator.machineNumber ? ` (${log.workSession.excavator.machineNumber})` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">Submitted by {log.workSession.operator.name}</p>
                </div>
                <p className="text-sm font-semibold">{formatDate(log.date)}</p>
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-sm">
                {log.startHourMeter != null && (
                  <>
                    <p className="text-muted-foreground">Start Meter</p>
                    <p className="text-right font-semibold">{formatHours(log.startHourMeter)}</p>
                  </>
                )}
                {log.endHourMeter != null && (
                  <>
                    <p className="text-muted-foreground">End Meter</p>
                    <p className="text-right font-semibold">{formatHours(log.endHourMeter)}</p>
                  </>
                )}
                <p className="text-muted-foreground">Hours</p>
                <p className="text-right font-semibold">{formatHours(log.hoursWorked)}</p>
                {log.attachment && (
                  <>
                    <p className="text-muted-foreground">Attachment</p>
                    <p className="text-right font-semibold">{log.attachment}</p>
                  </>
                )}
                {log.dieselLiters != null && (
                  <>
                    <p className="text-muted-foreground">Diesel</p>
                    <p className="text-right font-semibold">{log.dieselLiters} L</p>
                  </>
                )}
                {log.notes && (
                  <>
                    <p className="text-muted-foreground">Note</p>
                    <p className="text-right font-semibold">{log.notes}</p>
                  </>
                )}
              </div>
              <LogApproveReject logId={log.id} version={log.version} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
