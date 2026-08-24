import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";
import { ApproveWorkRequestDialog } from "./approve-work-request-dialog";
import { RejectWorkRequestDialog } from "./reject-work-request-dialog";

type OpenRequest = {
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

export function OperatorWorkRequestCard({
  request,
  customers,
}: {
  request: OpenRequest;
  customers: { id: string; name: string; companyName: string | null }[];
}) {
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-bold">Operator-Reported Job</p>
          <Badge className={request.status === "PENDING" ? "bg-idle text-idle-foreground" : "bg-primary text-primary-foreground"}>
            {request.status === "PENDING" ? "Awaiting Your Approval" : "In Progress"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <p className="text-muted-foreground">Operator</p>
          <p className="text-right font-semibold">{request.operator.name}</p>
          <p className="text-muted-foreground">Started</p>
          <p className="text-right font-semibold">{formatDateTime(request.startDate)}</p>
          <p className="text-muted-foreground">Starting Reading</p>
          <p className="text-right font-semibold">{formatHours(request.startHourMeter)}</p>
          {request.status === "PENDING" && (
            <>
              <p className="text-muted-foreground">Ended</p>
              <p className="text-right font-semibold">{request.endDate ? formatDateTime(request.endDate) : "—"}</p>
              <p className="text-muted-foreground">Ending Reading</p>
              <p className="text-right font-semibold">{formatHours(request.endHourMeter ?? 0)}</p>
            </>
          )}
          {request.siteName && (
            <>
              <p className="text-muted-foreground">Site</p>
              <p className="text-right font-semibold">{request.siteName}</p>
            </>
          )}
          {request.attachment && (
            <>
              <p className="text-muted-foreground">Attachment</p>
              <p className="text-right font-semibold">{request.attachment}</p>
            </>
          )}
          {request.dieselLiters != null && (
            <>
              <p className="text-muted-foreground">Diesel</p>
              <p className="text-right font-semibold">
                {request.dieselLiters} L{request.dieselDate ? ` (${formatDateTime(request.dieselDate)})` : ""}
              </p>
            </>
          )}
          {request.notes && (
            <>
              <p className="text-muted-foreground">Note</p>
              <p className="text-right font-semibold">{request.notes}</p>
            </>
          )}
        </div>

        {request.status === "PENDING" && request.endHourMeter != null && (
          <div className="flex gap-2 pt-1">
            <RejectWorkRequestDialog requestId={request.id} />
            <ApproveWorkRequestDialog
              requestId={request.id}
              operatorName={request.operator.name}
              startHourMeter={request.startHourMeter}
              endHourMeter={request.endHourMeter}
              attachment={request.attachment}
              siteName={request.siteName}
              dieselLiters={request.dieselLiters}
              dieselDate={request.dieselDate}
              notes={request.notes}
              customers={customers}
            />
          </div>
        )}
        {request.status === "ACTIVE" && (
          <p className="text-xs text-muted-foreground">Still in progress — nothing to approve until they end the job.</p>
        )}
      </CardContent>
    </Card>
  );
}
