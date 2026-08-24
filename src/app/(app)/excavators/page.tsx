"use client";

import Link from "next/link";
import useSWR from "swr";
import { Plus, Truck } from "lucide-react";
import type { getMachinePerformanceSummary, listExcavators } from "@/lib/services/excavators";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MachineCard } from "@/components/machine-card";
import { MachinePerformanceList } from "@/components/machine-performance-list";
import { EmptyState } from "@/components/empty-state";
import Loading from "../loading";

type ExcavatorsData = {
  excavators: Awaited<ReturnType<typeof listExcavators>>;
  machinePerformance: Awaited<ReturnType<typeof getMachinePerformanceSummary>>;
};

export default function ExcavatorsPage() {
  const { data } = useSWR<ExcavatorsData>("/api/excavators", swrFetcher, { dedupingInterval: 15_000 });

  if (!data) return <Loading />;
  const { excavators, machinePerformance } = data;

  return (
    <div>
      <PageHeader
        title="My Excavators"
        action={
          <Button size="lg" className="h-11" nativeButton={false} render={<Link href="/excavators/new" />}>
            <Plus className="size-5" />
            Add Machine
          </Button>
        }
      />

      <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
        {excavators.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No Excavators Added Yet"
            description="Add your first excavator to start managing your fleet."
            actionLabel="Add First Machine"
            actionHref="/excavators/new"
          />
        ) : (
          <>
            <MachinePerformanceList machines={machinePerformance} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {excavators.map((ex) => (
                <MachineCard key={ex.id} excavator={ex} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
