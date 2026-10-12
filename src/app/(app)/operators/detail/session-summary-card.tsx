"use client";

import useSWR from "swr";
import { ArrowRight } from "lucide-react";
import type { getOperatorPeriodsOverview } from "@/lib/services/workingPeriods";
import { swrFetcher } from "@/lib/api-client";
import type { Plain } from "@/lib/plain";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";

type Overview = Plain<NonNullable<Awaited<ReturnType<typeof getOperatorPeriodsOverview>>>>;

/** The at-a-glance session state on the Overview tab: which session is running and,
 * when one was just started off the back of unpaid dues, what it opened owing. */
export function SessionSummaryCard({ operatorId }: { operatorId: string }) {
  const { data } = useSWR<Overview>(`/api/operators/${operatorId}/periods`, swrFetcher);
  if (!data) return null;

  const { summary, periods } = data;
  const current = periods.find((p) => p.status === "ACTIVE") ?? periods[periods.length - 1];
  if (!current) return null;

  const closed = current.status !== "ACTIVE";

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-base font-bold">Session #{current.sessionNumber}</span>
          <Badge variant={closed ? "secondary" : "default"}>{closed ? "Closed" : "Working"}</Badge>
        </div>
        <p className="text-muted-foreground">
          Started {formatDate(new Date(current.startDate))}
          {current.endDate ? ` · ended ${formatDate(new Date(current.endDate))}` : ""}
        </p>

        {current.previousBalance !== 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-700 dark:text-amber-300">
            <ArrowRight className="size-3.5 shrink-0" />
            <span className="font-semibold">
              Opened with {formatCurrency(current.previousBalance)} carried forward from Session #
              {current.openingSourceSession}
            </span>
          </div>
        )}

        {closed && summary.totalOutstanding > 0 && (
          <p className="text-muted-foreground">
            {formatCurrency(summary.totalOutstanding)} still owed. Starting a new session can carry it forward.
          </p>
        )}

        <div className="mt-1 flex justify-between border-t pt-2 text-base">
          <span className="font-semibold">Total Outstanding</span>
          <span className="font-bold">{formatCurrency(summary.totalOutstanding)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
