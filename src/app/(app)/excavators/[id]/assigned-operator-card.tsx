import { HardHat } from "lucide-react";
import { listOperatorOptions } from "@/lib/services/operators";
import { Card, CardContent } from "@/components/ui/card";
import { AssignOperatorDialog } from "./assign-operator-dialog";
import { EndOperatorAssignmentButton } from "./end-operator-assignment-button";

export async function AssignedOperatorCard({
  businessId,
  excavatorId,
  currentOperator,
}: {
  businessId: string;
  excavatorId: string;
  currentOperator: { id: string; name: string; mobile: string } | null;
}) {
  const operators = await listOperatorOptions(businessId);

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HardHat className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Assigned Operator</p>
            <p className="truncate font-bold">{currentOperator ? currentOperator.name : "Not assigned"}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AssignOperatorDialog
            excavatorId={excavatorId}
            operators={operators}
            hasCurrentOperator={!!currentOperator}
          />
          {currentOperator && <EndOperatorAssignmentButton excavatorId={excavatorId} />}
        </div>
      </CardContent>
    </Card>
  );
}
