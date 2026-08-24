"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { CheckCircle2, HardHat, Loader2, Plus, Trophy, UserPlus } from "lucide-react";
import type { getOperatorRankingLast45Days, listOperators, listPendingJoinRequests } from "@/lib/services/operators";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionTitle } from "@/components/dashboard/section-title";
import { formatCurrency } from "@/lib/utils/currency";
import { formatHours } from "@/lib/utils/hours";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { DeleteOperatorButton } from "./delete-operator-button";
import Loading from "../loading";

type OperatorsData = {
  operators: Awaited<ReturnType<typeof listOperators>>;
  pendingLogCount: number;
  pendingWorkRequestCount: number;
  joinRequests: Awaited<ReturnType<typeof listPendingJoinRequests>>;
  ranking: Awaited<ReturnType<typeof getOperatorRankingLast45Days>>;
};

function JoinRequestCard({ id, name, mobile }: { id: string; name: string; mobile: string }) {
  const { mutate } = useSWRConfig();
  const [pending, setPending] = useState<"approve" | "decline" | null>(null);

  async function respond(action: "approve" | "decline") {
    setPending(action);
    try {
      await apiFetch(`/api/operators/${id}/${action}-join`, { method: "POST" });
      await mutate("/api/operators");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-bold">
            <UserPlus className="size-4 text-primary" />
            {name}
          </p>
          <p className="text-sm text-muted-foreground">{mobile}</p>
          <Badge variant="outline" className="mt-1 text-xs">
            Requested to join
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={pending !== null} onClick={() => respond("decline")}>
            {pending === "decline" ? <Loader2 className="size-4 animate-spin" /> : "Decline"}
          </Button>
          <Button type="button" size="sm" disabled={pending !== null} onClick={() => respond("approve")}>
            {pending === "approve" ? <Loader2 className="size-4 animate-spin" /> : "Approve"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OperatorsPage() {
  const { data } = useSWR<OperatorsData>("/api/operators", swrFetcher, { dedupingInterval: 15_000 });

  if (!data) return <Loading />;

  const { operators, pendingLogCount, pendingWorkRequestCount, joinRequests, ranking } = data;
  const pendingCount = pendingLogCount + pendingWorkRequestCount;

  return (
    <div>
      <PageHeader
        title="Operators"
        action={
          <Button size="lg" className="h-11" nativeButton={false} render={<Link href="/operators/new" />}>
            <Plus className="size-5" />
            Add Operator
          </Button>
        }
      />

      <div className="flex flex-col gap-3 px-4 pb-6 md:px-8">
        {joinRequests.map((req) => (
          <JoinRequestCard key={req.id} id={req.id} name={req.name} mobile={req.mobile} />
        ))}
        {pendingCount > 0 && (
          <Link
            href="/operators/approvals"
            className="card-hover flex items-center justify-between gap-2 rounded-xl border border-idle/40 bg-idle/10 px-4 py-3 text-sm font-semibold text-idle-foreground"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="size-4" />
              {pendingCount} item{pendingCount === 1 ? "" : "s"} waiting for approval
            </span>
            <span>Review →</span>
          </Link>
        )}
        {operators.length === 0 ? (
          <EmptyState
            icon={HardHat}
            title="No Operators Yet"
            description="Add your first operator to assign them to machines and track salary."
            actionLabel="Add Operator"
            actionHref="/operators/new"
          />
        ) : (
          operators.map((op) => (
            <Card key={op.id} className="card-hover animate-fade-in-up">
              <CardContent className="flex items-center justify-between gap-2">
                <Link href={`/operators/detail?id=${op.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{op.name}</p>
                  <p className="text-sm text-muted-foreground">{op.mobile}</p>
                  <p className="text-sm text-muted-foreground">
                    {op.currentExcavator ? `On: ${op.currentExcavator}` : "Not assigned"}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <p className="text-sm font-semibold">{formatCurrency(op.defaultMonthlySalary)}/mo</p>
                  <DeleteOperatorButton operatorId={op.id} operatorName={op.name} />
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {ranking.length > 0 && (
          <Card className="animate-fade-in-up">
            <CardHeader>
              <SectionTitle icon={Trophy} tone="success">
                Ranking
              </SectionTitle>
              <p className="text-xs text-muted-foreground">
                Ranking is based on hours the operator has driven the excavator in the last 45 days.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {ranking.map((op, i) => (
                <div key={op.id} className="flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="font-semibold">{op.name}</span>
                  </div>
                  <span className="text-sm font-bold">{formatHours(op.hours)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
