import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { requireBusiness } from "@/lib/session";
import { listExcavators, getMachinePerformanceSummary } from "@/lib/services/excavators";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MachineCard } from "@/components/machine-card";
import { MachinePerformanceList } from "@/components/machine-performance-list";
import { EmptyState } from "@/components/empty-state";

export default async function ExcavatorsPage() {
  const { businessId } = await requireBusiness();
  const [excavators, machinePerformance] = await Promise.all([
    listExcavators(businessId),
    getMachinePerformanceSummary(businessId),
  ]);

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
